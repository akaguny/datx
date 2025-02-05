import { Collection, Model } from '@datx/core';
import * as fetch from 'isomorphic-fetch';

import {
  fetchModelLink,
  fetchModelRefLink,
  getModelLinks,
  getModelMeta,
  getModelRefMeta,
  jsonapi,
  modelToJsonApi,
  config,
} from '../../src';
import { clearAllCache } from '../../src/cache';

import { setRequest, setupNetwork, confirmNetwork } from '../utils/api';
import { Event, Image, TestStore } from '../utils/setup';
import { Response } from '../../src/Response';

const baseTransformRequest = config.transformRequest;
const baseTransformResponse = config.transformResponse;

describe('Network basics', () => {
  beforeEach(() => {
    config.fetchReference = fetch;
    config.baseUrl = 'https://example.com/';
    config.transformRequest = baseTransformRequest;
    config.transformResponse = baseTransformResponse;
    clearAllCache();
    setupNetwork();
  });

  afterEach(confirmNetwork);

  it('should fetch the basic data', async () => {
    setRequest({
      name: 'events-1',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll(Event);

    expect(events.data).toBeInstanceOf(Array);
    expect(events.data).toHaveLength(4);
    if (events.data instanceof Array) {
      const event = events.data[0];

      expect(event['title']).toBe('Test 1');
      expect(getModelMeta(event).createdAt).toBe('2017-03-19T16:00:00.000Z');
      expect(event.meta.refs.images).toBeInstanceOf(Array);
      if (event.meta.refs.images instanceof Array) {
        expect(event.meta.refs.images.map((image) => image.id)).toContain('1');
      }
      expect(event.meta.refs.images).toHaveLength(1);
      expect(getModelRefMeta(event).images.foo).toBe('bar');

      const data = modelToJsonApi(event);

      expect(data.id).toBe('1');
      expect(data.type).toBe('event');
      expect(data.attributes && data.attributes.title).toBe('Test 1');
      expect(
        data.relationships && data.relationships.images.data && data.relationships.images.data[0],
      ).toEqual({ type: 'image', id: '1' });
      expect(data.attributes && 'images' in data.attributes).toBe(false);
    }
  });

  it('return null if no data in response', async () => {
    setRequest({
      name: 'eempty',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll(Event);

    expect(events.data).toBeNull();
  });

  it('should handle id changes correctly', async () => {
    const store = new TestStore();
    const image1 = store.add({}, Image);
    const image2 = new Image({});

    setRequest({
      method: 'POST',
      name: 'image-1',
      url: 'image',
      responseFn(_path: string, req: string) {
        const request = JSON.parse(req);

        expect(request['data'].relationships.event.data).toBeNull();
      },
    });
    expect(parseInt(image1.id, 10)).toBeLessThan(0); // Temporary id, negative autoincrement
    await image1.save(); // Load the image-1.json data
    expect(image1.id).toBe('1');
    expect(image1.id).toBe(image1.meta.id);

    const images = store.findAll(Image);

    expect(images).toHaveLength(1);

    setRequest({
      method: 'POST',
      name: 'image-1',
      url: 'image',
    });
    expect(parseInt(image2.id, 10)).toBeLessThan(0); // Temporary id, negative autoincrement
    await image2.save(); // Load the image-1.json data
    expect(image2.id).toBe('1');
    expect(image2.id).toBe(image2.meta.id);
  });

  it('should serialize existing relationships', async () => {
    setRequest({
      name: 'events-1',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll(Event);

    expect(events.data).toBeInstanceOf(Array);
    if (events.data) {
      const event = events.data[0];
      const data = modelToJsonApi(event);

      expect(data.attributes && 'id' in data.attributes).toBe(false);
      expect(data.relationships).not.toBeUndefined();
      if (data.relationships) {
        expect(data.relationships.images.data).toHaveLength(1);
        expect(data.relationships.image.data).toBeNull();
      }
    }
  });

  it('should support transformRequest hook', async () => {
    setRequest({
      name: 'events-1',
      url: 'event/all',
    });
    let hasTransformRequestHookBeenCalled = false;
    const store = new TestStore();
    config.transformRequest = (opts): any => {
      expect(opts.collection).toBe(store);
      hasTransformRequestHookBeenCalled = true;
      return { ...opts, url: `${opts.url}/all` };
    };
    const events = await store.fetchAll('event');
    expect(events.data).toBeInstanceOf(Array);
    expect(hasTransformRequestHookBeenCalled).toBe(true);
  });

  it('should support transformResponse hook', async () => {
    setRequest({
      name: 'events-1',
      url: 'event',
    });
    let hasTransformResponseHookBeenCalled = false;
    config.transformResponse = (opts): any => {
      expect(opts.status).toBe(200);
      hasTransformResponseHookBeenCalled = true;
      return { ...opts, status: 201 };
    };
    const store = new TestStore();
    const events = await store.fetchAll('event');
    expect(events.data).toBeInstanceOf(Array);
    expect(events.status).toBe(201);
    expect(hasTransformResponseHookBeenCalled).toBe(true);
  });

  it('should save the jsonapi data', async () => {
    setRequest({
      name: 'jsonapi-object',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll('event');

    expect(events.data).toBeInstanceOf(Array);
    expect(events.data).toHaveLength(4);
    expect(events.jsonapi).toBeInstanceOf(Object);
    if (events.jsonapi) {
      expect(events.jsonapi.version).toBe('1.0');
      expect(events.jsonapi.meta && events.jsonapi.meta.foo).toBe('bar');
    }
  });

  it('should fetch one item', async () => {
    setRequest({
      name: 'event-1b',
      url: 'event/1',
    });

    const store = new TestStore();
    const events = await store.fetch(Event, '1');

    const record = events.data;

    expect(record).toBeInstanceOf(Object);
    if (record) {
      expect(record['title']).toBe('Test 1');
      expect(getModelLinks(record)).toBeInstanceOf(Object);
      expect(getModelLinks(record).self).toBe('https://example.com/event/1234');
    }
  });

  it('should support pagination', async () => {
    setRequest({
      name: 'events-1',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll(Event);

    expect(events.data).toBeInstanceOf(Array);
    expect(events.data).toHaveLength(4);
    if (events.data instanceof Array) {
      expect(events.data instanceof Array && events.data[0]['title']).toBe('Test 1');
      expect(events.links).toBeInstanceOf(Object);
      if (events.links instanceof Object && typeof events.links.next === 'object') {
        expect(events.links.next.href).toBe('https://example.com/event?page=2');
        expect(events.links.next.meta.foo).toBe('bar');
      }
    }

    setRequest({
      name: 'events-2',
      query: {
        page: 2,
      },
      url: 'event',
    });

    const events2 = await events.next?.();

    expect(events2).toBeInstanceOf(Object);
    if (events2) {
      expect(events2.data).toBeInstanceOf(Array);
      expect(events2.data).toHaveLength(2);
      expect(events2.data instanceof Array && events2.data[0]['title']).toBe('Test 5');

      const events1 = await events2.prev?.();

      expect(events1).toBeInstanceOf(Object);
      if (events1) {
        expect(events1.data).toBeInstanceOf(Array);
        expect(events1.data).toHaveLength(4);
        expect(events1.data instanceof Array && events1.data[0]['title']).toBe('Test 1');

        const events1b = await events2.prev?.();

        expect(events1.snapshot).toEqual(events.snapshot);
        expect(events1.snapshot).toEqual(events1b?.snapshot);
      }
    }
  });

  it('should fetch all pages', async () => {
    setRequest({
      name: 'events-1',
      url: 'event',
    });

    setRequest({
      name: 'events-2',
      query: {
        page: 2,
      },
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.getAll(Event);

    expect(events.data).toBeInstanceOf(Array);
    expect(events.data.length).toBe(6);
    expect(events.data[events.data.length - 1].title).toBe('Test 6');

    expect(events.responses).toBeInstanceOf(Array);
    expect(events.responses.length).toBe(2);

    expect(events.lastResponse).toBeInstanceOf(Response);
    expect(events.lastResponse).toEqual(events.responses[events.responses.length - 1]);
    expect(events.lastResponse.next).toBeUndefined();
  });

  it('should throw an error if getAll maxRequests is less than 1', async () => {
    const store = new TestStore();

    try {
      await store.getAll(Event, undefined, -1);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    try {
      await store.getAll(Event, undefined, 0);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('should support record links', async () => {
    setRequest({
      name: 'event-1',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll('event');
    const event = events.data;

    setRequest({
      name: 'image-1',
      url: 'images/1',
    });

    if (event) {
      const image = await fetchModelLink<Image>(event, 'image');

      const imageData = image.data as Image;

      expect(imageData.meta.id).toBe('1');
      expect(imageData.meta.type).toBe('image');
      expect(imageData['url']).toBe('https://example.com/1.jpg');
    }
  });

  it('should recover if no link defined', async () => {
    setRequest({
      name: 'event-1',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll(Event);

    const event = events.data;

    expect(event).toBeInstanceOf(Event);
    if (event instanceof Event) {
      let hasThrown = false;

      try {
        const foobar = await fetchModelLink(event, 'foobar');

        expect(foobar.data).toBeInstanceOf(Array);
        expect(foobar.data).toHaveLength(0);
      } catch (e: any) {
        hasThrown = true;
        expect(e.message).toBe("[datx exception] Link foobar doesn't exist on the model");
      }
      expect(hasThrown).toBe(true);
    }
  });

  it('should support relationship link fetch', async () => {
    setRequest({
      name: 'events-1',
      url: 'event',
    });

    const store = new TestStore();
    const events = await store.fetchAll(Event);
    const event = events.data && events.data instanceof Array && events.data[0];

    setRequest({
      name: 'image-1',
      url: 'event/1/images',
    });

    expect(event).toBeInstanceOf(Event);
    if (event) {
      const image = await fetchModelRefLink(event, 'images', 'self');
      const imageData = image.data as Image;

      expect(imageData.meta.id).toBe('1');
      expect(imageData.meta.type).toBe('image');
      expect(imageData['url']).toBe('https://example.com/1.jpg');
    }
  });

  it('should support endpoint', async () => {
    class TestEvent extends jsonapi(Model) {
      public static type = 'event';

      public static endpoint = 'foo/event';
    }

    class TestCollection extends Collection {
      public static types = [TestEvent];
    }

    const store = new (jsonapi(TestCollection))();

    setRequest({
      name: 'event-1',
      url: 'foo/event',
    });

    const response = await store.fetchAll(TestEvent);
    const event = response.data as TestEvent;

    expect(event.meta.type).toBe('event');

    const req = setRequest({
      method: 'PATCH',
      name: 'event-1',
      url: 'foo/event/12345',
    });

    await event.save();
    expect(req.isDone()).toBe(true);
  });

  it('should support functional endpoint', async () => {
    class TestEvent extends jsonapi(Model) {
      public static type = 'event';

      public static endpoint = (baseUrl: string): string => {
        return `${baseUrl}foo/event`;
      };
    }

    class TestCollection extends Collection {
      public static types = [TestEvent];
    }

    const store = new (jsonapi(TestCollection))();

    setRequest({
      name: 'event-1',
      url: 'foo/event',
    });

    const response = await store.fetchAll(TestEvent);
    const event = response.data as TestEvent;

    expect(event.meta.type).toBe('event');
  });

  it('should prepend config.baseUrl to the request url', async () => {
    setRequest({
      name: 'event-1b',
      url: 'event/1',
    });

    const store = new TestStore();
    const events = await store.request('event/1');

    const record = events.data as Event;

    expect(record['title']).toBe('Test 1');
  });

  it('should prepend config.baseUrl to the request url with special characters', async () => {
    setRequest({
      name: 'event-1b',
      url: 'event/1?test=hello%20world',
    });

    const store = new TestStore();
    const events = await store.request('event/1?test=hello%20world');

    const record = events.data as Event;

    expect(record['title']).toBe('Test 1');
  });

  it('should handle the request methods', async () => {
    setRequest({
      method: 'PUT',
      name: 'event-1b',
      url: 'event/1',
    });

    const store = new TestStore();
    const events = await store.request('event/1', 'PUT');

    const record = events.data as Event;

    expect(record['title']).toBe('Test 1');
  });
});
