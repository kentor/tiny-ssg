const debounce = require('debounce-promise');
const debug = require('debug')('tiny-ssg');
const fs = require('fs-extra');
const invariant = require('invariant');
const path = require('path');
const { gray, green, red, yellow } = require('chalk');

function outFileFromUrl(url, dest) {
  return path.normalize(
    path.join(dest, url, url.endsWith('/') ? 'index.html' : '')
  );
}

function time(fn) {
  return async function() {
    const start = Date.now();
    const results = await fn.apply(this);
    const end = Date.now();
    console.log(gray(`built in ${((end - start) / 1000).toFixed(2)}s`));
    return results;
  };
}

class SSG {
  constructor(opts = {}) {
    this.buildCache = new Map();
    this.dest = opts.dest || path.resolve('public');
    this.genManifest = null;
    this.prevManifest = null;
  }

  manifest(cb) {
    this.genManifest = async () => {
      const map = new Map();
      const pages = await cb();

      pages.forEach(page => {
        const { url, view } = page;

        if (typeof url !== 'string' || typeof view !== 'function') {
          console.log(
            yellow('warn'),
            page,
            'should have shape',
            '{ url: string, view: () => Promise<string> | string }'
          );
        } else if (map.has(url)) {
          console.log(
            yellow('warn'),
            `duplicate entry found for ${url}. skipping...`,
          );
        } else {
          map.set(url, { ...page, outFile: outFileFromUrl(url, this.dest) });
        }
      });

      return map;
    };
  }

  async build() {
    invariant(this.genManifest, 'build called without first calling manifest');

    const manifest = await this.genManifest();

    const writes = Array.from(manifest.values()).map(async page => {
      const data = await page.view(page.meta, page);

      if (this.buildCache.get(page.url) === data) {
        debug('cache hit for %s skipping write', page.url);
      } else {
        this.buildCache.set(page.url, data);
        await fs.outputFile(page.outFile, data);
        console.log(green('wrote'), page.url, data.length);
      }

      return page;
    });

    let deletes;
    if (this.prevManifest) {
      deletes = Array.from(this.prevManifest.values())
        .filter(page => !manifest.has(page.url))
        .map(async page => {
          await fs.remove(page.outFile);
          this.buildCache.delete(page.url);
          console.log(red('deleted'), page.url);
          return page;
        });
    } else {
      deletes = [];
    }

    this.prevManifest = manifest;

    await Promise.all([...writes, ...deletes]);

    return;
  }

  async dryRun() {
    const manifest = await this.genManifest();
    for (const page of manifest.values()) {
      console.log(page.url);
    }
  }
}

SSG.prototype.build = time(SSG.prototype.build);
SSG.prototype.build = debounce(SSG.prototype.build, 0);

module.exports = SSG;
