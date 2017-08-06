# Contributor dashboard

## Initial setup

(most of these steps will get automated. But they aren't, yet.)

You will need node 6.x. Sorry. https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions

Check out ghcrawler and -cli:

```
git clone git@github.com:Microsoft/ghcrawler.git
git clone git@github.com:Microsoft/ghcrawler-cli.git
git clone git@github.com:Microsoft/ghcrawler-dashboard.git
```

Get a github access token by going to https://github.com/settings/tokens and creating a token. Give it, for now, all permissions (because I haven't worked out which ones it needs yet). Keep a record of it; you're only shown it once.

Now, start up the crawler:

```
cd ghcrawler
npm install # you only need to do this the first time
cd docker
CRAWLER_GITHUB_TOKENS=<your github token> docker-compose up # this will take a while the first time because it downloads docker images
```

and teach the crawler about your repositories:

```
cd ghcrawler-cli
npm install # you only need to do this the first time
node bin/cc tokens "<your github token>#private" # the quotes are important here
node bin/cc queue agithubid/agithubrepo # e.g., stuartlangridge/sorttable
node bin/cc start 5
```

Check out the dash maker:

```
git clone git@bitbucket.org:stuartlangridge/makedash-ghcrawler.git # that's this repo, so if you've already got it, just go to it
npm install # only need this the first time
cp config.yaml.example config.yaml
# edit config.yaml to contain your list of repositories
node makedash.js
```

and your dashboard should be in `dashboard/index.js` (unless you changed that in config.yaml).
