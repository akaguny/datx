import { IType, Model, prop } from '@datx/core';
import { mobx } from '@datx/utils';

import { jsonapiAngular } from '../../../src/public-api';
import { Event } from './Event';

export class Image extends jsonapiAngular(Model) {
  public static type: IType = 'image';

  @prop
  public name!: string;

  @prop.toOne('event')
  public event!: Event;

  @mobx.computed
  get id(): string {
    return this.meta.id.toString();
  }
}
