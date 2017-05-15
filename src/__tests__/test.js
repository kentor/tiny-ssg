const path = require('path');
const stripAnsi = require('strip-ansi');

let mockOutputFile;
let mockRemove;

jest.mock('fs-extra', () => ({
  outputFile: mockOutputFile,
  remove: mockRemove,
}));

function withoutBuildTime(logs) {
  return logs
    .map(args => args.map(stripAnsi))
    .filter(args => !args[0].startsWith('built'));
}

describe('ssg', () => {
  let deletes;
  let logs;
  let SSG;
  let ssg;
  let writes;

  beforeEach(() => {
    deletes = [];
    logs = [];
    writes = [];

    mockOutputFile = jest.fn(async (outFile, data) => {
      writes.push([outFile, data]);
    });

    mockRemove = jest.fn(async (outFile) => {
      deletes.push(outFile);
    });

    console.log = (...args) => {
      logs.push(args);
    };

    SSG = require('../index');
    ssg = new SSG({ dest: '/public/' });
  });

  describe('#build', () => {
    it('throws when called without first calling manifest', async () => {
      try {
        await ssg.build();
      } catch (err) {
        expect(err.message).toMatch(/build.*?manifest/);
      }
    });

    it('writes according to dest and manifest', async () => {
      ssg.manifest(() => [
        { url: '/', view: () => 'index page' },
        { url: '/about/', view: async () => 'about page' },
        { url: '/feed.xml', view: () => '<?xml>feed</xml>' },
      ]);

      const results = await ssg.build();

      expect(results).toMatchSnapshot();
      expect(writes).toMatchSnapshot();
      expect(withoutBuildTime(logs)).toMatchSnapshot();
    });

    it('does not write the same content twice', async () => {
      ssg.manifest(() => [{ url: '/', view: () => '' }]);
      await ssg.build();
      expect(writes).toMatchSnapshot();
      await ssg.build();
      expect(writes).toMatchSnapshot();
    });

    it('updates a page when view function returns a new value', async () => {
      ssg.manifest(() => [{ url: '/', view: () => '1' }]);
      await ssg.build();
      expect(writes).toMatchSnapshot();
      ssg.manifest(() => [{ url: '/', view: () => '2' }]);
      await ssg.build();
      expect(writes).toMatchSnapshot();
    });

    it('deletes a page when it is no longer in manifest', async () => {
      ssg.manifest(() => [
        { url: '/', view: () => '' },
        { url: '/about/', view: () => '' },
      ]);
      await ssg.build();
      expect(writes).toMatchSnapshot();
      ssg.manifest(() => [
        { url: '/', view: () => '' },
      ]);
      await ssg.build();
      expect(deletes).toMatchSnapshot();
      expect(withoutBuildTime(logs)).toMatchSnapshot();
    });

    it('passes meta and a cloned page object to the view', async () => {
      const meta = {};
      ssg.manifest(() => [{
        url: '/',
        view: (meta, page) => {
          expect(meta).toBe(meta);
          expect(page.url).toBe('/');
          return '';
        },
        meta,
      }]);
      await ssg.build();
    });

    it('is debounced', async () => {
      ssg.manifest(() => []);

      const first = ssg.build();
      const second = ssg.build();
      expect(second).toBe(first);

      await new Promise(resolve => setTimeout(resolve, 1));

      const third = ssg.build();
      expect(third).not.toBe(first);
    });

    it('warns when a page does not follow the expected shape', async () => {
      ssg.manifest(() => [
        { url: '/missing-view/' },
        { view: () => 'missing url' },
        'something random',
      ]);
      await ssg.build();
      expect(withoutBuildTime(logs)).toMatchSnapshot();
    });
  });

  describe('#dryRun', () => {
    it('logs out the urls from manfiest', () => {
      ssg.manifest(() => [
        { url: '/', view: () => '' },
        { url: '/about/', view: () => '' },
        { url: '/feed.xml', view: () => '' },
      ]);
    });
  });
});


describe('instance', () => {
  it('is an instance of ssg', () => {
    const instance = require('../instance');
    const SSG = require('../index');
    expect(instance).toBeInstanceOf(SSG);
    expect(instance.dest).toBe(path.resolve('public'));
  });
});
