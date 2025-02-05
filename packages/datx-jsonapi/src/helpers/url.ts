import { getModelType, IType, PureCollection, PureModel } from '@datx/core';

import { URL_REGEX } from '../consts';
import { IFilters } from '../interfaces/IFilters';
import { IHeaders } from '../interfaces/IHeaders';
import { IJsonapiModel } from '../interfaces/IJsonapiModel';
import { IRequestOptions } from '../interfaces/IRequestOptions';
import { IRequest } from '../interfaces/JsonApi';
import { config } from '../NetworkUtils';
import { ParamArrayType } from '@datx/network';

function parametrize(params: object, scope = ''): Array<{ key: string; value: string }> {
  const list: Array<{ key: string; value: string }> = [];

  Object.keys(params).forEach((key) => {
    if (params[key] instanceof Array) {
      if (config.paramArrayType === ParamArrayType.CommaSeparated) {
        list.push({ key: `${scope}${key}`, value: params[key].join(',') });
      } else if (config.paramArrayType === ParamArrayType.MultipleParams) {
        // eslint-disable-next-line prefer-spread
        list.push.apply(
          list,
          params[key].map((param) => ({ key: `${scope}${key}`, value: param })),
        );
      } else if (config.paramArrayType === ParamArrayType.ParamArray) {
        // eslint-disable-next-line prefer-spread
        list.push.apply(
          list,
          params[key].map((param) => ({ key: `${scope}${key}][`, value: param })),
        );
      }
    } else if (typeof params[key] === 'object') {
      // eslint-disable-next-line prefer-spread
      list.push.apply(list, parametrize(params[key], `${key}.`));
    } else {
      list.push({ key: `${scope}${key}`, value: params[key] });
    }
  });

  return list;
}

function prepareFilters(filters: IFilters): Array<string> {
  return parametrize(filters).map((item) => `filter[${item.key}]=${item.value}`);
}

function prepareSort(sort?: string | ReadonlyArray<string>): Array<string> {
  return sort ? [`sort=${sort}`] : [];
}

function prepareIncludes(include?: string | ReadonlyArray<string>): Array<string> {
  if (!include) {
    return [];
  }

  if (config.sortParams && Array.isArray(include)) {
    return [`include=${[...include].sort()}`];
  }

  return [`include=${include}`];
}

function prepareFields(fields: Record<string, string | ReadonlyArray<string>>): Array<string> {
  const list: Array<string> = [];

  Object.keys(fields).forEach((key) => {
    list.push(`fields[${key}]=${fields[key]}`);
  });

  return list;
}

function prepareRawParams(
  params: ReadonlyArray<{ key: string; value: string } | string>,
): Array<string> {
  return params.map((param) => {
    if (typeof param === 'string') {
      return param;
    }

    return `${param.key}=${param.value}`;
  });
}

function prefixUrl(url: string, containsBase?: boolean): string {
  if (URL_REGEX.test(url) || containsBase) {
    return url;
  }

  return `${config.baseUrl}${url}`;
}

function appendParams(url: string, params: Array<string>): string {
  let newUrl = url;

  if (params.length) {
    const separator = newUrl.indexOf('?') === -1 ? '?' : '&';

    newUrl += separator + params.join('&');
  }

  return newUrl;
}

function encodeParam(param: string): string {
  // Manually decode field-value separator (=) - only the first one
  return encodeURIComponent(param).replace(/%3D/, '=');
}

export function buildUrl(
  url: string,
  data?: IRequest,
  options?: IRequestOptions,
  containsBase?: boolean,
): {
  url: string;
  data?: object;
  headers: IHeaders;
} {
  const headers: Record<string, string> =
    (options && options.networkConfig && options.networkConfig.headers) || {};
  let params: Array<string> = ([] as Array<string>).concat(
    prepareFilters(options?.queryParams?.filter || {}),
    prepareSort(options?.queryParams?.sort),
    prepareIncludes(options?.queryParams?.include),
    prepareFields(options?.queryParams?.fields || {}),
    prepareRawParams(options?.queryParams?.custom || []),
  );

  if (config.encodeQueryString) {
    params = params.map(encodeParam);
  }

  let baseUrl: string = appendParams(prefixUrl(url, containsBase), params);

  if (config.sortParams) {
    baseUrl = sortUrlParams(baseUrl);
  }

  return { data, headers, url: baseUrl };
}

function sortUrlParams(url: string) {
  const [baseUrl, searchParams] = url.split('?');

  if (!searchParams) {
    return url;
  }

  const urlSearchParams = new URLSearchParams(searchParams);

  urlSearchParams.sort();

  const urlSearchParamsString = config.encodeQueryString
    ? urlSearchParams.toString()
    : decodeURIComponent(urlSearchParams.toString());

  return `${baseUrl}?${urlSearchParamsString}`;
}

export function prepareQuery(
  type: IType,
  id?: number | string,
  data?: IRequest,
  options?: IRequestOptions,
  collection?: PureCollection,
  model?: IJsonapiModel,
): {
  url: string;
  data?: object;
  headers: IHeaders;
} {
  let queryModel: typeof PureModel | IJsonapiModel | undefined =
    model && (model.constructor as typeof PureModel);

  if (!queryModel && collection) {
    const staticCollection = collection.constructor as typeof PureCollection;

    [queryModel] = staticCollection.types.filter((item) => item.type === type);
  }

  let containsBase = false;
  let path: string;

  if (!queryModel) {
    path = type.toString();
  } else if (queryModel['endpoint'] && typeof queryModel['endpoint'] === 'function') {
    containsBase = true;
    path = queryModel['endpoint'](config.baseUrl);
  } else {
    path = queryModel['endpoint'] || queryModel['baseUrl'] || getModelType(queryModel);
  }

  const url: string = id ? `${path}/${id}` : `${path}`;

  return buildUrl(url, data, options, containsBase);
}
