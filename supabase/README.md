# Supabase setup

1. Rotate every credential that has been shared outside your secret manager.
2. In the Supabase SQL Editor, run `migrations/20260903_electoral_roll.sql`.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the server deployment environment.
4. Do not expose the service-role key with a `NEXT_PUBLIC_` variable or commit it to the repository.

The application creates a PDF asset and an indexing job for each new upload. A completed job writes normalized voter records to `voters`; failed jobs retain an actionable error message.
