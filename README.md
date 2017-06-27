# Contributor dashboard

## Initial setup

(most of these steps will get automated. But they aren't, yet.)

Check out ghcrawler and -cli:

```
git clone git@github.com:Microsoft/ghcrawler.git
git clone git@github.com:Microsoft/ghcrawler-cli.git
```

Get a github access token by going to https://github.com/settings/tokens and creating a token. Give it, for now, all permissions (because I haven't worked out which ones it needs yet). Keep a record of it; you're only shown it once.

Now, start up the crawler:

```
cd ghcrawler
npm install # you only need to do this the first time
cd docker
docker-compose up # this will take a while the first time because it downloads docker images
```

and teach the crawler about your repositories:

```
cd ghcrawler-cli
node bin/cc tokens "<your github token>#private" # the quotes are important here
node bin/cc queue agithubid/agithubrepo # e.g., stuartlangridge/sorttable
node bin/cc start 5
```

Check out the dash maker:

```
git clone git@bitbucket.org:stuartlangridge/makedash-ghcrawler.git # that's this repo, so if you've already got it, just go to it
npm install # only need this the first time
cp config.yaml.example config.yaml
# in theory you would now edit config.yaml, but the repos list in it is currently ignored.
node makedash.js
```

and your dashboard should be in `dashboard/index.js` (unless you changed that in config.yaml).
