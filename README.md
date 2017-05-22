# tiny-ssg

[![Build Status](https://travis-ci.org/kentor/tiny-ssg.svg)](https://travis-ci.org/kentor/tiny-ssg) [![npm](https://img.shields.io/npm/v/tiny-ssg.svg)](https://www.npmjs.com/package/tiny-ssg)

An unopinionated static site generator with a tiny api, that is friendly with a
watched hot reloaded environment.

# api

## ``new SSG(opts = { dest: `${process.cwd()}/public` })``

Creates a new `SSG` instance. `opts.dest` specifies the destination of the
generated html files. `opts.dest` defaults to the `public` dir under the current
working directory. It's probably easier to just use the next api instead.

## `ssg = require('tiny-ssg/instance')`

Returns a new `SSG` instance with defaults args. Possible to set the destination
by setting `ssg.dest`. This is more friendly with watch mode and
invalidate-module.

## `ssg.manifest(cb: () => Promise<Page[]> | Page[]): void`

This is how you would specify the pages to be built.

`Page` has the type:

```js
type Page = {
  url: string,
  view: (meta: any, page: Page) => Promise<string> | string,
  meta?: any,
}
```

`url` specifies the destination where you would ultimately access the page when
served on your host. e.g. `/`, `/posts/title-slug/`, `/posts/feed.xml`.

`view` is a function whose return value will be written to disk at the
appropriate file for the url. The return value may be a Promise that resolves
into a string. It is passed the `meta` object and the `Page` object itself.

`meta` will be passed as the first argument to view. This could be anything that
the view would find useful.

The `cb` arg to `manifest` should return a list or a Promise that resolves to a
list of `Page` objects.

## `ssg.build(): Promise<void>`

Executes the callback given in `manifest()` and builds the site according to the
returned `Page` objects.

There is no guaranteed order of executing the `view` functions or the
order of the writes. Views may be executed in parallel. For this reason, if your
views depend on the same resource, you need to write code that is friendly with
parallel access of resources. See the Recommended Utilities section.

If `build()` is ran again in the same process, it will the manifest callback
again and rebuild the site with these differences:

- if the view of a url returns the same string, it will not write out
- if a url is missing from the previous `manifest`, the page will be deleted

# trivial example

Here's a trivial example to demonstrate the API:

```js
const ssg = require('tiny-ssg/instance');

ssg.manifest(() => {
  return [
    { url: '/', view: () => 'Hello World!' },
  ];
});

ssg.build();
```

This will write to `Hello World!` to `public/index.html`.

# watch mode example

`tiny-ssg` is great with watchers like [chokidar][c] and tools like
[invalidate-module][i]:

```js
// watch.js
const chokidar = require('chokidar');
const invalidate = require('invalidate-module');

const watcher = chokidar.watch('*.js').on('all', (event, filename) => {
  invalidate(path.resolve(filename));
  require('./build')();
});
```

```js
// build.js
const ssg = require('tiny-ssg/instance');

ssg.manifest(() => {
  return [
    { url: '/', view: () => 'Hello World!' },
  ];
});

module.exports = () => ssg.build();
```

Now you if you execute `node watch.js`, you may freely update the view function
in `build.js` and it will rebuild the site.

# markdown file example

Using [marky-markdown][m], [fs-extra][f], and [async/await][a]:

```js
const fs = require('fs-extra');
const md = require('marky-markdown');
const ssg = require('tiny-ssg/instance');

ssg.manifest(() => {
  return [
    { url: '/', view: markdownView, meta: { file: 'test.md' } },
  ];
});

async function markdownView(meta) {
  const raw = await fs.readFile(meta.file);
  return md(raw);
}

ssg.build();
```

# react example

Use `ReactDOMServer.renderToStaticMarkup`:

```js
const React = require('react');
const ssg = require('tiny-ssg/instance');
const { renderToStaticMarkup } = require('react-dom/server');

ssg.manifest(() => {
  return [
    { url: '/', view: reactView },
  ];
});

function reactView() {
  const element = (
    <html>
      <head><title>Hello World!</title></head>
      <body><h1>Hello World!</h1></body>
    </html>
  );
  return `<!doctype html>${renderToStaticMarkup(element)}`
}

ssg.build();
```

It's up to you on how you compose your React components. Stateless functional
components work well here.

# how to make rebuilds fast

In watch mode, since the build process is ran all over again on `build()`, you
would need to prevent excessive calls to expensive operations for fast rebuilds.
For example, if your view reads from a file, then the read should be cached and
could be invalidated by the file's `mtime`.

Views that perform async I/O will be executed concurrently. If multiple views
read from the same resource, you can use something like [reuse-promise][r] to
prevent parallel reads of the same resource.

[a]: https://babeljs.io/docs/plugins/transform-async-to-generator/
[c]: https://github.com/paulmillr/chokidar
[f]: https://github.com/jprichardson/node-fs-extra
[i]: https://yarnpkg.com/en/package/invalidate-module
[m]: https://github.com/npm/marky-markdown
[r]: https://github.com/elado/reuse-promise
