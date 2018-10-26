# Measure

Measure is the working name for this prototype. We're not sold on the name yet either. As has been [pointed out](https://martinfowler.com/bliki/TwoHardThings.html), naming things is hard. We're busy thinking of a better name, but if you have a suggestion let us know!

## What is Measure?

At its core Measure is, for lack of a better term, a contributor relationship management system. Measure consists of easy to understand widgets that can be arbitrarily displayed to build dashboards. It allows you to understand how people as individuals and as organizations are interacting with open source projects on GitHub. It’s metrics that focus not only on code, but on contributors.

Screenshot: ![MeasureOSS demo](https://github.com/MeasureOSS/Measure/blob/master/assets/img/MeasureOSS-11052017.png)

## Philosophy

* Should be simple
    * We’re willing to trade some flexibility for simplicity
* Should be visually appealing
* Should offer an opinionated default experience, but be extensible
    * We want useful actionable information out of the box, but if you want something different you should be able to easily do so
* Should be able to completely separate inside and outside contributions
* Should treat the concept of contributors as first class citizens
    * Your community is really about the people that create the code
    * it's not about assigning performance scores to your community members, but giving awareness of what's going on so you can find out why

## Sections
* Overview
    * Contains a dashboard with an overview of all repositories
* Repositories
    * Contains dashboards for individual repositories
* Organizations
    * Contains dashboards aggregated by organization
* Teams
    * Contains dashboards aggregated by team (which are groups of repositories defined by you)
* Reports
    * Contains individual reports
* Contributors
    * Contains dashboards for individual contributors

## This is a prototype

Please be aware that this is beta quality software. It should work as expected, but documentation is lacking and setup is still manual. Both issues are important to us and will be addressed as the project matures. That said, we welcome your feedback on both the concept and implementation. Additionally, the metrics we track are still being decided. Feel free to use the issue tracker to suggest the addition, removal, or modification of widgets. We very much want this to be a community effort!

From the v0.1 release notes:

    This is the initial release of Measure. It should be relatively stable, reasonably easy to install, and work mostly as expected. There may be some bugs lurking and the docs do need some improvement. We're hard at work on v0.2 which should improve usability, provide easier installation, have more complete docs, and increase stability. The next release from there should be v1.0. Please use the issue tracker for feedback. Let us know what you think!

A huge thank you to [Linux Fund](http://linuxfund.org/) for sponsoring the initial release of Measure!

## Initial setup

(most of these steps will get automated. But they aren't, yet.)

Requirements:
* web server with PHP (5.5+) support (if you don't have an existing setup, this can be satisfied with: `docker run --name nginx-measure -p 443:443 -p 80:80 -v /path/to/Measure/dashboard:/var/www/html -v /path/to/Measure/database:/var/www/database -d boxedcode/alpine-nginx-php-fpm`
* node 6.x.
* git
* docker-compose

Check out ghcrawler and -cli:

```
git clone https://github.com/Microsoft/ghcrawler.git
git clone https://github.com/Microsoft/ghcrawler-cli.git
git clone https://github.com/Microsoft/ghcrawler-dashboard.git
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
node bin/cc tokens "<your github token>#private" # the quotes are important here. Note: replace 'private' with 'public' for public repositories, you can have a mix of public and private tokens
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
