# How to write Measure reports

Measure allows the creation of "reports"; full-page summaries of data. These are very free-form; basically, a report can display whatever it wants without restriction. 

## Basic report creation

Your widget is expected to be a Node.js module which exports one function. That function takes two parameters, `options` and `callback`. It should call the callback with an object with `title` and `html` keys. The `title` is displayed as the title of the report, and should be plain text; `html` is a block of HTML which is placed as-is, without escaping, into the body of the report page. Reports are automatically linked from the "Reports" summary page.

## Authentication

A report may contain restricted information. If so, it is possible to restrict the report to be viewed only by authenticated users. To do this, add a `requires_authentication: true` entry to the output object. Note that authentication has to be enabled in `config.yaml`, otherwise the report will not be generated at all (a warning is printed in this situation). It is not possible to restrict a report to _specific_ authenticated users; just authenticated or not.
