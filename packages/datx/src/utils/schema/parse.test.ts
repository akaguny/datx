import { User, Comment, CustomType } from '../../../test/mock';
import { parseSchema } from './parse';

describe('parse', () => {
  it('should do basic parsing', () => {
    const user = parseSchema(User, {
      username: 'FooBar',
      age: 27,
    });

    expect(user.username).toBe('FooBar');
    expect(user.age).toBe(27);
  });

  it('should do nested parsing with custom types', () => {
    const comment = parseSchema(Comment, {
      date: '2022-07-01T00:00:00.000Z',
      upvotes: [
        {
          username: 'FooBar',
        },
      ],
      author: {
        username: 'FooBar',
      },
      post: {
        title: 'foobar',
        date: '2022-07-01T00:00:00.000Z',
        text: 'Lorem ipsum',
      },
      text: 'This is a test',
      test: 2,
    });

    expect(comment.date.toISOString()).toBe('2022-07-01T00:00:00.000Z');
    expect(comment.post.date).toBeInstanceOf(Date);
    expect(comment.text).toBe('This is a test');
    expect(comment.test).toBeInstanceOf(CustomType);
  });
});
