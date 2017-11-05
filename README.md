# MeasureOSS

MeasureOSS is the working name for this prototype. We don't like the name either, and we're busy thinking of a better one.

## What is MeasureOSS?

MeasureOSS is a simple widget based dashboard that takes a contributor-focused view of open source community analytics.

Screenshot: ![MeasureOSS demo](https://github.com/MeasureOSS/Measure/blob/master/assets/img/MeasureOSS-11052017.png)

## Philosophy

## This is a prototype

Please be aware that this is beta quality software. That said, we welcome your feedback on both the concept and implementation. Additionally, the metrics we track are still being decided. Feel free to use the issue tracker to suggest the addition, removal, or modification of widgets. 

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
node bin/cc orgs yourorg # e.g., MeasureOSS
node bin/cc tokens "<your github token>#private" # the quotes are important here
node bin/cc queue agithubid/agithubrepo # e.g., MeasureOSS/Measure
node bin/cc start 8
```

Check out the dash maker:

```
Clone this repo
npm install # only need this the first time
cp config.yaml.example config.yaml
# edit config.yaml to contain your list of repositories
node makedash.js
```

and your dashboard should be in `dashboard/index.js` (unless you changed that in config.yaml).
