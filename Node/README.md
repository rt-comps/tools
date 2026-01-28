# Node files #

Some Node scripts to automate processes

Each script also has a shell wrapper
## *Create a new component* - new-component.js

Creates a new component with the name(s) provided, using the standard template files.
 - [index.js](index.md)
 - [comp.html](html.md)
 - [comp.js](js.md)

**Note:** "rt-" will be prepended to the name of the component name provided

## *Minify and deploy a list of components* - deploy.js

Replaces the named component(s) files in the live ('docs').

 - Javascript and HTML files are minified.
 - Markdown files are ignored
 - Any other files, e.g. images, are copied as is

The changes will go live when the new files in the 'docs' folder are manually synced to GitHub

