# Postsig Client App

## Setting up Local Development

### Minimum Node version

Make sure to have node version `22.x` or higher.

```
node -v # check node version
npm ci
```

### Install GitHub CLI

```
brew install gh
```

### Install Docker

Install **Docker Desktop**: Download and install Docker Desktop: https://docs.docker.com/desktop/install/mac-install

### Install Vercel CLI

```
npm install --global vercel@latest
```

link to your project

```
vercel link
```

### Clone repo, select branch, and install dependencies

```
gh repo clone postsig/postsig-nextjs or git clone git@github.com:postsig/postsig-nextjs.git
git checkout development
npm ci
```

#### Note about branches

1. **main:** To run a copy of the prod app, checkout the 'main' branch.
2. **staging:** To run a copy of the staging app, checkout the 'staging' branch.
3. **development**: To see the latest features in development, checkout the 'development' branch

### Install and initialize Supabase

Install the Supabase CLI and start up a fresh copy of the database. The latest migrations in **/supabase/migrations** will be applied. You should also make sure to use the supabase package provided in package.json to run the Supabase commands (ie. npm run supabase:start rather than supabase start), otherwise you may have trouble creating users in the next step.

```
brew install supabase/tap/supabase
npm run supabase:start
npx supabase db reset
```

You might have to enable extensions in your supabase db locally if the version of the extension in the migrations is different than the version of the extension in your local db.

#### Local database dumps

Local database dumps should be saved under `project_folder/data*.sql` as it's ignored by git. This is a good practice to do at least with a basic setup of users. Then whenever there is an issue with the database, you can reset supabase & restore the database from the dump.

dump data to a file

```
npx supabase db dump --data-only -f data.sql
```

restore data from a file

```
psql --single-transaction --variable ON_ERROR_STOP=1 --command 'SET session_replication_role = replica' --file data.sql --dbname postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### Create user and storage bucket in Supabase

The local Supabase dashboard can be found at http://127.0.0.1:54323. At this point the database is empty, so you'll need to create a user and then a storage bucket before you can upload a document.

1. Under **Authentication**, click **Add User** > **Create New User**. See below for types of user accounts depending on the app you need to work on.
2. Under **Storage**, click **New bucket** and create a bucket called "contract_docs".

### Create .env.local

Use vercel CLI to create the .env.local file.

```
vercel env pull .env.local
```

### Run Inngest

This process will run in the background. Once it's running, open a new tab to start the app in the next step.

```
npx inngest-cli@latest dev
```

### Install & start Redis

This is the easiest way to start Redis locally, but you can also do something on your own.

```
docker run --name redis -p 6379:6379 -d redis
```

Attach a volume to the container to persist data.

```
docker run --name redis -p 6379:6379 -d redis redis-server --save 60 1 --loglevel warning
```

### Edge Config

Edge config is a vercel kv store we use for maintenance mode and other configurations. `EDGE_CONFIG` env variable value can be found in the vercel dashboard.

### Start the app

In the new tab, start the app.

```
npm run dev
```

You should see the app running at `http://localhost:3000`.

## Checking emails sent by supabase locally

To check the emails sent by supabase locally, you can use `http://localhost:54324`.

## Supabase misc

`npm run supabase:start` to start the database.

`npm run supabase:stop` to stop the database.

`supabase login` for deploying your db to the cloud. Not needed for local development.

Link to your database:

```

supabase link --project-ref <project-id>
You can get <project-id> from your project's dashboard URL: https://supabase.com/dashboard/project/<project-id>

```

```

supabase db pull
supabase migration up

# Capture any changes that you have made to your remote database before you went through the steps above

# If you have not made any changes to the remote database, skip this step

```

Start your db
`supabase start`

## Migrations

After you make some changes to the database schema, you can generate a migration file with the following command:

```

supabase db diff -f <name-of-migration-file>

```

This will generate a file in the `migrations` directory. All changes will be saved there. When you have more changes, you can create another migration file and so on. You can then apply the migration with the following command:

```

supabase db push (since we are using github actions to apply the migrations, we don't need to run this command)

```

Warning: Do not run `supabase db push` if you have not reviewed the migration file. This will apply the migration to the database and cannot be undone! Always apply your changes to the staging db.

## Deploy to Production on Vercel

Only tagged commits will be deployed to production. To deploy to production, you need to create a new tag and push it to the repository.

```

git checkout staging
git pull
git checkout -b release/[YYYY-MM-DD]
git push origin release/[YYYY-MM-DD]

```

or

```
npm run release:start [major|minor|patch] "Optional release notes"
```

Then create a pull request from `release/[YYYY-MM-DD]` to `main`. After the pull request is merged(Squash & Merge), you can create a tag and push it to the repository. The tag should be the same as the release name. You can also delete the `release/[YYYY-MM-DD]` branch.

```

git checkout main
git pull
npm version [major|minor|patch] -m "[release name]"
git push origin main

```

or

```
npm run release:finish patch "Optional release notes"
```

The Github Actions will deploy the application to production. Then go to github and create a release with the same tag name. Click on generate release notes and publish the release.

### Create Feature Pull Request

When you are ready to create a pull request for your feature branch against the `development` branch, you can use the following script. This script will:

1. Ensure you are not on `main`, `development`, or `staging`.
2. Push your current branch to the remote origin.
3. Gather all commit messages from your branch that are not in `development`.
4. Create a GitHub Pull Request targeting `development`, using your branch name as the title and the chronological list of commit messages as the body.

**Prerequisites:**

- You must be on your feature branch.
- You must have the [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated.

Run the script using:

```
npm run pr:feature
```

## App maintenance mode

To enable maintenance mode, set the `isInMaintenanceMode` key on Edge Config Store to `true`. This will show the maintenance page to all users. To disable maintenance mode, set the key to `false`.

## Linting

Before deployment if you run `npx tsc --noEmit` and fix all the errors, it will save you a lot of time in the deployment process.

## Documentation

For detailed technical documentation, see the `/docs` folder:

- **[Contract Access Management](./docs/CONTRACT_ACCESS_MANAGEMENT.md)** - Complete guide to contract permissions and access control
- **[ACL Quick Reference](./docs/ACL_QUICK_REFERENCE.md)** - Quick start guide for ACL system
- **[ACL Migration Guide](./docs/ACL_MIGRATION_GUIDE.md)** - Migrating from old permission system
- **[ACL Implementation Summary](./docs/ACL_IMPLEMENTATION_SUMMARY.md)** - Technical implementation details
- **[Security Headers](./docs/SECURITY-HEADERS.md)** - Security configuration

## Supabase Functions

### Secrets

```
HOURLY_SUMMARY_EMAIL_LIST = mike@postsig.com,faith@postsig.com,cindy@postsig.com,jack@postsig.com,ryan@postsig.com,ziya@postsig.com,phil@postsig.com,sadiqa@postsig.com
```
