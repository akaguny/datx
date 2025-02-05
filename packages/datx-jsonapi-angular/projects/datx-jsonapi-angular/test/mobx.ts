import { mobx } from '@datx/utils';

let testMobx = mobx;

Object.assign(mobx, {
  configure() {
    // noop
  },
  isComputedProp(_val: any): boolean {
    return false;
  },
});

// @ts-ignore
mobx.configure = () => {
  /**/
};

if (!['-1', '0'].includes(process.env.MOBX_VERSION || '0')) {
  testMobx = require('mobx');
  testMobx.makeObservable = testMobx.makeObservable || mobx.makeObservable;
}

export default testMobx;
