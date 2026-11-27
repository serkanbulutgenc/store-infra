# Search suggestions use Elasticsearch; the results page stays on Postgres

Search suggestions (the entries offered under the search box while a Shopper types) are served by Elasticsearch. The search results page (`/ara`) keeps using Postgres. We chose Elasticsearch to learn it and to be ready for a larger catalog; at today's size Postgres would have been enough. This replaces, for suggestions, the earlier plan in `store-backend` to move to Meilisearch.

## Considered options

- **Postgres only**: no new service, nothing to keep in sync, and the same matching as the results page. Rejected because it meets neither reason above.
- **Meilisearch**: lighter, and the earlier plan. Rejected in favour of Elasticsearch for the same reasons.
- **Moving suggestions and the results page together**: consistent results, but it means rebuilding filters, facets and visibility rules at once. Deferred.
- **The Elasticsearch completion suggester**: very fast, but matches only from the start of an indexed phrase. We use `search_as_you_type`, which matches any word, tolerates typos and can filter.

## Consequences

- The server needs more memory: Elasticsearch gets a 1 GB heap (about 2 GB for the container), at least 2.5 GB must be free before it is enabled, and the recommended minimum server grows to 8 GB.
- Elasticsearch is optional. Without it, or while it is down, suggestions do not appear and everything else works.
- The two engines can disagree: a suggestion may match text for which the results page finds nothing. Moving the results page to Elasticsearch is the follow-up that removes this.
- A background job re-reads every suggestible item each minute instead of reacting to changes, because several writes emit no change signal and some visibility changes happen with no write. Revisit when a full pass no longer fits comfortably in that minute.
- The index is derived data: it is not backed up, only rebuilt.
