"""The optional Elasticsearch service, checked on resolved Compose configurations.

    check_search.py WITH_PROFILES.json WITHOUT_PROFILES.json

Both arguments are files (or pipes) with `docker compose config --format json` output.
"""

import json
import sys

NAME = "elasticsearch"
GIB = 1024**3


def problems(on: dict, off: dict) -> list[str]:
    out = []
    if NAME in off["services"]:
        out.append(f"{NAME} is part of the stack with the profile off")
    service = on["services"].get(NAME)
    if service is None:
        return [*out, f"{NAME} is missing with the profile `search` on"]
    if service.get("profiles") != ["search"]:
        out.append("it must be in the profile `search` only")
    if not service.get("image", "").endswith(f"/{NAME}:9.5.7"):
        out.append(f"image must be pinned to 9.5.7, not {service.get('image')!r}")
    if service.get("ports"):
        out.append("it must publish no port")
    if list(service.get("networks", {})) != ["data"]:
        out.append("it must be on the `data` network only")
    if not on["networks"]["data"].get("internal"):
        out.append("the `data` network must be internal")
    environment = service.get("environment", {})
    if environment.get("discovery.type") != "single-node":
        out.append("it must run as a single node")
    if environment.get("ES_JAVA_OPTS") != "-Xms1g -Xmx1g":
        out.append("the heap must be 1 GB")
    if int(service.get("mem_limit", 0)) != 2 * GIB:
        out.append("the memory limit must be 2 GB")
    mounts = {v.get("target"): v.get("type") for v in service.get("volumes", [])}
    if mounts.get("/usr/share/elasticsearch/data") != "volume":
        out.append("its data must be on a named volume")
    if not service.get("healthcheck", {}).get("test"):
        out.append("it needs a healthcheck")
    if service.get("logging") != on["services"]["postgres"].get("logging"):
        out.append("it must use the shared log rotation")
    out.extend(
        f"{other} must not depend on {NAME}"
        for other, config in on["services"].items()
        if NAME in config.get("depends_on", {})
    )
    return out


if __name__ == "__main__":
    configs = []
    for path in sys.argv[1:3]:
        with open(path) as file:
            configs.append(json.load(file))
    bad = problems(*configs)
    if bad:
        print("FAIL: " + "\nFAIL: ".join(bad))
        sys.exit(1)
