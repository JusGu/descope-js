/* eslint-disable max-classes-per-file */
// @ts-nocheck
import createSdk, { ensureFingerprintIds } from '@descope/web-js-sdk';
import { fireEvent, waitFor } from '@testing-library/dom';
import '@testing-library/jest-dom';
import { screen } from 'shadow-dom-testing-library';
import {
  ASSETS_FOLDER,
  CONFIG_FILENAME,
  CUSTOM_INTERACTIONS,
  DESCOPE_ATTRIBUTE_PREFIX,
  DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
  ELEMENT_TYPE_ATTRIBUTE,
  RESPONSE_ACTIONS,
  URL_CODE_PARAM_NAME,
  URL_ERR_PARAM_NAME,
  URL_RUN_IDS_PARAM_NAME,
  URL_TOKEN_PARAM_NAME,
  URL_REDIRECT_AUTH_CALLBACK_PARAM_NAME,
  URL_REDIRECT_AUTH_BACKUP_CALLBACK_PARAM_NAME,
  URL_REDIRECT_AUTH_CHALLENGE_PARAM_NAME,
  URL_REDIRECT_AUTH_INITIATOR_PARAM_NAME,
  OIDC_IDP_STATE_ID_PARAM_NAME,
  SAML_IDP_STATE_ID_PARAM_NAME,
  SAML_IDP_USERNAME_PARAM_NAME,
  SSO_APP_ID_PARAM_NAME,
  HAS_DYNAMIC_VALUES_ATTR_NAME,
  OIDC_LOGIN_HINT_PARAM_NAME,
  DESCOPE_IDP_INITIATED_PARAM_NAME,
  OIDC_PROMPT_PARAM_NAME,
  SDK_SCRIPT_RESULTS_KEY,
  OIDC_ERROR_REDIRECT_URI_PARAM_NAME,
} from '../src/lib/constants';
import DescopeWc from '../src/lib/descope-wc';
// eslint-disable-next-line import/no-namespace
import * as helpers from '../src/lib/helpers/helpers';
// eslint-disable-next-line import/no-namespace
import { generateSdkResponse, invokeScriptOnload } from './testUtils';
import { getABTestingKey } from '../src/lib/helpers/abTestingKey';
import BaseDescopeWc from '../src/lib/descope-wc/BaseDescopeWc';
// We load forter script in the test because we mock it and ensure it is called properly
import loadForter from '../src/lib/descope-wc/sdkScripts/forter';

jest.mock('../src/lib/descope-wc/sdkScripts/forter', () => jest.fn());

jest.mock('@descope/web-js-sdk', () => ({
  __esModule: true,
  default: jest.fn(),
  clearFingerprintData: jest.fn(),
  ensureFingerprintIds: jest.fn(),
}));

const WAIT_TIMEOUT = 10000;
const THEME_DEFAULT_FILENAME = `theme.json`;

const abTestingKey = getABTestingKey();

const defaultOptionsValues = {
  baseUrl: '',
  deferredRedirect: false,
  abTestingKey,
  lastAuth: {},
  oidcIdpStateId: null,
  oidcLoginHint: null,
  oidcPrompt: null,
  samlIdpStateId: null,
  samlIdpUsername: null,
  oidcErrorRedirectUri: null,
  descopeIdpInitiated: false,
  ssoAppId: null,
  client: {},
  redirectAuth: undefined,
  tenant: undefined,
  locale: 'en',
};

class MockFileReader {
  onload = null;

  readAsDataURL() {
    if (this.onload) {
      this.onload({
        target: {
          result: 'data:;base64,example',
        },
      });
    }
  }
}

const sdk = {
  flow: {
    start: jest.fn().mockName('flow.start'),
    next: jest.fn().mockName('flow.next'),
  },
  webauthn: {
    helpers: {
      isSupported: jest.fn(),
      conditional: jest.fn(() => Promise.resolve()),
      create: jest.fn(),
      get: jest.fn(),
    },
  },
  getLastUserLoginId: jest.fn().mockName('getLastUserLoginId'),
  getLastUserDisplayName: jest.fn().mockName('getLastUserDisplayName'),
};

const nextMock = sdk.flow.next as jest.Mock;
const startMock = sdk.flow.start as jest.Mock;
const isWebauthnSupportedMock = sdk.webauthn.helpers.isSupported as jest.Mock;
const getLastUserLoginIdMock = sdk.getLastUserLoginId as jest.Mock;
const getLastUserDisplayNameMock = sdk.getLastUserDisplayName as jest.Mock;

// this is for mocking the pages/theme/config
let themeContent = {};
let pageContent = '';
let configContent: any = {};

class TestClass {}

const fetchMock: jest.Mock = jest.fn();
global.fetch = fetchMock;

Object.defineProperty(window, 'location', {
  value: new URL(window.location.origin),
});
window.location.assign = jest.fn();
window.open = jest.fn();

Object.defineProperty(window, 'PublicKeyCredential', { value: TestClass });

Object.defineProperty(window.history, 'pushState', {
  value: (x: any, y: any, url: string) => {
    window.location.href = url;
  },
});
Object.defineProperty(window.history, 'replaceState', {
  value: (x: any, y: any, url: string) => {
    window.location.href = url;
  },
});

class DescopeButton extends HTMLElement {
  constructor() {
    super();
    const template = document.createElement('template');
    template.innerHTML = `<button><slot></slot></button>`;

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}

customElements.define('descope-button', DescopeButton);
const origAppend = document.body.append;

describe('web-component', () => {
  beforeEach(() => {
    configContent = {
      flows: {
        'versioned-flow': { version: 1 },
        otpSignInEmail: { version: 1 },
      },
      componentsVersion: '1.2.3',
    };
    jest.useFakeTimers();

    globalThis.DescopeUI = {};

    fetchMock.mockImplementation((url: string) => {
      const res = {
        ok: true,
        headers: new Headers({ 'x-geo': 'XX' }),
      };

      switch (true) {
        case url.endsWith('theme.json'): {
          return { ...res, json: () => themeContent };
        }
        case url.endsWith('.html'): {
          return { ...res, text: () => pageContent };
        }
        case url.endsWith('config.json'): {
          return { ...res, json: () => configContent };
        }
        default: {
          return { ok: false };
        }
      }
    });
    (createSdk as jest.Mock).mockReturnValue(sdk);

    invokeScriptOnload();
  });

  afterEach(() => {
    // document.getElementsByTagName('html')[0].innerHTML = '';

    document.getElementsByTagName('head')[0].innerHTML = '';
    document.getElementsByTagName('body')[0].innerHTML = '';
    document.body.append = origAppend;
    jest.resetAllMocks();
    window.location.search = '';
    themeContent = {};
    pageContent = '';
  });

  it('should switch theme on the fly', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<button id="email">Button</button><span>It works!</span>';

    const DescopeUI = {
      componentsThemeManager: { currentThemeName: undefined },
    };
    globalThis.DescopeUI = DescopeUI;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc theme="light" flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Button'), {
      timeout: WAIT_TIMEOUT,
    });

    const wc = document.querySelector('descope-wc');
    wc.setAttribute('theme', 'dark');

    const rootEle = wc.shadowRoot.querySelector('#root');

    await waitFor(
      () =>
        expect(DescopeUI.componentsThemeManager.currentThemeName).toBe('dark'),
      { timeout: 3000 },
    );
    await waitFor(() => expect(rootEle).toHaveAttribute('data-theme', 'dark'), {
      timeout: 3000,
    });
  }, 5000);

  it('should clear the flow query params after render', async () => {
    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_1&code=123456`;
    nextMock.mockReturnValue(generateSdkResponse({}));

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('should call the error cb when API call returns error', async () => {
    pageContent = '<input id="email" name="email"></input>';

    startMock.mockReturnValue(
      generateSdkResponse({
        ok: false,
        requestErrorMessage: 'Not found',
        requestErrorDescription: 'Not found',
      }),
    );

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    const wcEle = document.getElementsByTagName('descope-wc')[0];

    const onError = jest.fn();
    wcEle.addEventListener('error', onError);

    await waitFor(
      () =>
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            detail: {
              errorMessage: 'Not found',
              errorDescription: 'Not found',
            },
          }),
        ),
      { timeout: WAIT_TIMEOUT },
    );

    wcEle.removeEventListener('error', onError);
  });

  it('When WC loads it injects the correct content', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('When WC loads it injects the theme', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input id="email"></input><span>It works!</span>';
    themeContent = {
      light: { globals: 'button { color: red; }' },
      dark: { globals: 'button { color: blue; }' },
    };

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1" theme="light"></descope-wc>`;
    const shadowEle = document.getElementsByTagName('descope-wc')[0].shadowRoot;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const themeStyleEle = shadowEle?.querySelector(
      'style:last-child',
    ) as HTMLStyleElement;
    expect(themeStyleEle.innerText).toContain(
      (themeContent as any).light.globals,
    );
    expect(themeStyleEle.innerText).toContain(
      (themeContent as any).dark.globals,
    );
  });

  it('Auto focus input by default', async () => {
    startMock.mockReturnValue(generateSdkResponse());
    const autoFocusSpy = jest.spyOn(helpers, 'handleAutoFocus');
    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(autoFocusSpy).toBeCalledWith(expect.any(HTMLElement), true, true);
  });

  it('Auto focus should not happen when auto-focus is false', async () => {
    startMock.mockReturnValue(generateSdkResponse());
    const autoFocusSpy = jest.spyOn(helpers, 'handleAutoFocus');
    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc auto-focus="false" flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(autoFocusSpy).toBeCalledWith(expect.any(HTMLElement), false, true);
  });

  it('Auto focus should not happen when auto-focus is `skipFirstScreen`', async () => {
    startMock.mockReturnValue(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));
    const autoFocusSpy = jest.spyOn(helpers, 'handleAutoFocus');
    pageContent =
      '<input id="email"></input><descope-button>click</descope-button><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc auto-focus="skipFirstScreen" flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(autoFocusSpy).toBeCalledWith(
      expect.any(HTMLElement),
      'skipFirstScreen',
      true,
    );
    autoFocusSpy.mockClear();

    fireEvent.click(screen.getByShadowText('click'));
    await waitFor(
      () => {
        expect(autoFocusSpy).toBeCalledWith(
          expect.any(HTMLElement),
          'skipFirstScreen',
          false,
        );
      },
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should fetch the data from the correct path', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0.html`;
    const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
    const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

    const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
    const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
    const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(htmlUrlPathRegex),
      expect.any(Object),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(themeUrlPathRegex),
      expect.any(Object),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(configUrlPathRegex),
      expect.any(Object),
    );
  });

  it('should fetch the data from the correct path with custom style name', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail" style-id="test"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0.html`;
    const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/test.json`;
    const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

    const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
    const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
    const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(htmlUrlPathRegex),
      expect.any(Object),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(themeUrlPathRegex),
      expect.any(Object),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(configUrlPathRegex),
      expect.any(Object),
    );
  });

  it('should fetch the data from the correct base static url', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail" base-static-url="http://base.url/pages"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/base.url\/pages.*\.html/),
      expect.any(Object),
    );
  });

  it('should throw an error project-id is missing', async () => {
    class Test extends DescopeWc {
      constructor() {
        super();
        Object.defineProperty(this, 'shadowRoot', {
          value: { isConnected: true, appendChild: () => {} },
        });
      }

      // eslint-disable-next-line class-methods-use-this
      public get flowId() {
        return '1';
      }
    }

    customElements.define('test-project', Test as any);
    const descope: any = new Test();
    Object.defineProperty(descope.shadowRoot, 'host', {
      value: { closest: jest.fn() },
      writable: true,
    });

    await expect(descope.init.bind(descope)).rejects.toThrow(
      'project-id cannot be empty',
    );
  });

  it('should throw an error when flow-id is missing', async () => {
    class Test extends DescopeWc {
      constructor() {
        super();
        Object.defineProperty(this, 'shadowRoot', {
          value: { isConnected: true, appendChild: () => {} },
        });
      }

      // eslint-disable-next-line class-methods-use-this
      public get projectId() {
        return '1';
      }
    }
    customElements.define('test-flow', Test as any);
    const descope: any = new Test();
    Object.defineProperty(descope.shadowRoot, 'host', {
      value: { closest: jest.fn() },
      writable: true,
    });

    await expect(descope.init.bind(descope)).rejects.toThrow(
      'flow-id cannot be empty',
    );
  });

  it('should update the page when props are changed', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    startMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    pageContent = '<input id="email"></input><span>It updated!</span>';

    const wcEle = document.getElementsByTagName('descope-wc')[0];

    wcEle.setAttribute('project-id', '2');

    await waitFor(() => screen.findByShadowText('It updated!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('When submitting it injects the next page to the website', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button>click</descope-button><input id="email"></input><input id="code"></input><span>Loaded</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded'), {
      timeout: WAIT_TIMEOUT,
    });

    pageContent =
      '<input id="email"></input><input id="code"></input><span>It works!</span>';

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    expect(startMock).toBeCalledTimes(1);
    expect(nextMock).toBeCalledTimes(1);
  });

  it('When submitting it calls next with the button id', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="submitterId">click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith(
        '0',
        '0',
        'submitterId',
        1,
        '1.2.3',
        {
          email: '',
          origin: 'http://localhost',
        },
      ),
    );
  });

  it('When submitting it calls next with the input value', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="submitterId">click</descope-button><input id="toggle" name="t1" value="123"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-up-or-in" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(
      () =>
        expect(nextMock).toHaveBeenCalledWith(
          '0',
          '0',
          'submitterId',
          0,
          '1.2.3',
          {
            t1: '123',
            origin: 'http://localhost',
          },
        ),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('When submitting and no execution id - it calls start with the button id and token if exists', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    configContent = {
      ...configContent,
      flows: {
        'sign-in': { startScreenId: 'screen-0' },
      },
    };
    const token = 'token1';
    window.location.search = `?&${URL_TOKEN_PARAM_NAME}=${token}`;
    pageContent =
      '<descope-button id="submitterId">click</descope-button><input id="email" name="email"></input><span>hey</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1" redirect-url="http://custom.url"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        {
          ...defaultOptionsValues,
          redirectUrl: 'http://custom.url',
          preview: false,
        },
        undefined,
        'submitterId',
        0,
        '1.2.3',
        {
          email: '',
          origin: 'http://localhost',
          token,
        },
      ),
    );
  });

  it('When there is a single button and pressing on enter, it clicks the button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="buttonId">Click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() => expect(nextMock).toHaveBeenCalled());
  });

  it('should not load components which are already loaded', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent =
      '<descope-test-button id="email">Button</descope-test-button><span>It works!</span>';

    customElements.define('descope-test-button', class extends HTMLElement {});

    const DescopeUI = { 'descope-test-button': jest.fn() };
    globalThis.DescopeUI = DescopeUI;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Button'), {
      timeout: WAIT_TIMEOUT,
    });

    expect(DescopeUI['descope-test-button']).not.toHaveBeenCalled();
  });

  it('When there is a single "sso" button and pressing on enter, it clicks the button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="noClick">No Click</descope-button><descope-button id="click" data-type="sso">Click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith(
        '0',
        '0',
        'click',
        1,
        '1.2.3',
        expect.any(Object),
      ),
    );
  });

  it('When there is a single "generic" button and pressing on enter, it clicks the button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="noClick">No Click</descope-button><descope-button id="click" data-type="button">Click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith(
        '0',
        '0',
        'click',
        1,
        '1.2.3',
        expect.any(Object),
      ),
    );
  });

  it('When there are multiple "generic" buttons and pressing on enter, it does not click any button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="1" data-type="button">Click</descope-button><descope-button id="2" data-type="button">Click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() => expect(nextMock).not.toHaveBeenCalled());
  });

  it('When there are multiple "sso" buttons and pressing on enter, it does not click any button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="1" data-type="sso">Click</descope-button><descope-button id="2" data-type="sso">Click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() => expect(nextMock).not.toHaveBeenCalled());
  });

  it('When there are multiple "generic" and "sso" buttons and pressing on enter, it does not click any button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="1" data-type="button">Click</descope-button><descope-button id="1" data-type="button">Click</descope-button><descope-button id="1" data-type="sso">Click</descope-button><descope-button id="2" data-type="sso">Click</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() => expect(nextMock).not.toHaveBeenCalled());
  });

  it('When there are multiple button and pressing on enter, it does not clicks any button', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="buttonId">Click</descope-button><descope-button id="buttonId1">Click2</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() => expect(nextMock).not.toHaveBeenCalled());
  });

  it('When there is a passcode with auto-submit enabled, it auto-submits on input event if value is valid', async () => {
    startMock.mockReturnValue(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse());

    globalThis.DescopeUI = {
      'descope-passcode': jest.fn(),
    };

    pageContent =
      '<descope-passcode data-auto-submit="true" data-testid="otp-code"></descope-passcode><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const codeComponent = screen.getByShadowTestId(
      'otp-code',
    ) as HTMLInputElement;
    codeComponent.checkValidity = jest.fn(() => true);

    fireEvent.input(codeComponent);

    expect(startMock).toHaveBeenCalled();
    await waitFor(() => expect(nextMock).toHaveBeenCalled(), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('should update the page messages when page is remaining the same but the state is updated', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(
      generateSdkResponse({ screenState: { errorText: 'Error!' } }),
    );

    pageContent = `<descope-button>click</descope-button><div>Loaded1</div><span ${ELEMENT_TYPE_ATTRIBUTE}="error-message">xxx</span>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });

    pageContent = `<div>Loaded2</div><span ${ELEMENT_TYPE_ATTRIBUTE}="error-message">xxx</span>`;

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(
      () =>
        screen.getByShadowText('Error!', {
          selector: `[${ELEMENT_TYPE_ATTRIBUTE}="error-message"]`,
        }),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should update page inputs according to screen state', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(
      generateSdkResponse({ screenState: { inputs: { email: 'email1' } } }),
    );

    pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="email">`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() => screen.getByShadowDisplayValue('email1'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('should go next with no file', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse());

    // Use the mock FileReader in your tests.
    (global as any).FileReader = MockFileReader;

    pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="image" type="file" placeholder="image-ph">`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(
      () =>
        expect(nextMock).toHaveBeenCalledWith('0', '0', null, 1, '1.2.3', {
          image: '',
          origin: 'http://localhost',
        }),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should update page templates according to screen state', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({ screenState: { user: { name: 'john' } } }),
    );

    pageContent = `<div>Loaded1</div><descope-text class="descope-text">hey {{user.name}}!</descope-text>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => screen.getByShadowText('hey john!'));
  });

  it('should update page templates according to last auth login ID when there is only login Id', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({ screenState: { user: { name: 'john' } } }),
    );
    getLastUserLoginIdMock.mockReturnValue('not john');

    pageContent = `<div>Loaded1</div><descope-text class="descope-text">hey {{lastAuth.loginId}}!</descope-text>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => screen.getByShadowText('hey not john!'));
  });

  it('should update page templates according to last auth name when there is only login Id', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({ screenState: { user: { name: 'john' } } }),
    );
    getLastUserLoginIdMock.mockReturnValue('not john');

    pageContent = `<div>Loaded1</div><descope-text class="descope-text">hey {{lastAuth.name}}!</descope-text>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => screen.getByShadowText('hey not john!'));
  });

  it('should update page templates according to last auth name when there is login Id and name', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({ screenState: { user: { name: 'john' } } }),
    );
    getLastUserLoginIdMock.mockReturnValue('not john');
    getLastUserDisplayNameMock.mockReturnValue('Niros!');

    pageContent = `<div>Loaded1</div><descope-text class="descope-text">hey {{lastAuth.name}}!</descope-text>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => screen.getByShadowText('hey Niros!!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('should update totp and notp link href according to screen state', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({
        screenState: {
          totp: { provisionUrl: 'url1' },
          notp: { redirectUrl: 'url2' },
        },
      }),
    );

    pageContent = `<div>Loaded1</div>
      <descope-link data-type="totp-link">Provision URL</descope-link>
      <descope-link data-type="notp-link">Redirect URL</descope-link>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => screen.getByShadowText('Provision URL'));

    const totpLink = screen.getByShadowText('Provision URL');
    expect(totpLink).toHaveAttribute('href', 'url1');

    const notpLink = screen.getByShadowText('Redirect URL');
    expect(notpLink).toHaveAttribute('href', 'url2');
  });

  it('should disable webauthn buttons when its not supported in the browser', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    isWebauthnSupportedMock.mockReturnValue(false);

    pageContent = `<div>Loaded1</div><descope-button data-type="biometrics">Webauthn</descope-button>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });

    const btn = screen.getByShadowText('Webauthn');
    expect(btn).toHaveAttribute('disabled', 'true');
  });

  it('should update root css var according to screen state', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({ screenState: { totp: { image: 'base-64-text' } } }),
    );

    const spyGet = jest.spyOn(customElements, 'get');
    spyGet.mockReturnValueOnce({ cssVarList: { url: '--url' } } as any);

    pageContent = `<div>Loaded1</div>`;

    document.body.innerHTML = `<h1>Custom element test</h1><descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded1'), {
      timeout: WAIT_TIMEOUT,
    });

    const shadowEle = document.getElementsByTagName('descope-wc')[0].shadowRoot;

    const rootEle = shadowEle.querySelector('#root');
    await waitFor(
      () =>
        expect(rootEle).toHaveStyle({
          '--url': 'url(data:image/jpg;base64,base-64-text)',
        }),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should update the page when user changes the url query param value', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<input id="email" name="email"></input>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    const logSpy = jest.spyOn(console, 'warn');

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_1`;

    fireEvent.popState(window);

    await waitFor(
      () =>
        expect(logSpy).toHaveBeenCalledWith('No screen was found to show', ''),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should handle a case where config request returns error response', async () => {
    const fn = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('config.json')) {
        return { ok: false };
      }
      return fn(url);
    });
    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    const errorSpy = jest.spyOn(console, 'error');

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(
      () =>
        expect(errorSpy).toHaveBeenCalledWith(
          'Cannot get config file',
          'Make sure that your projectId & flowId are correct',
          expect.any(Error),
        ),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should update the page when user clicks on back', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<input id="email"></input><span>It works!</span>';

    document.body.innerHTML = `<descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_1`;

    pageContent = '<input id="email"></input><span>It updated!</span>';

    fireEvent.popState(window);

    const shadowEle = document.getElementsByTagName('descope-wc')[0].shadowRoot;
    const rootEle = shadowEle.querySelector('#root');
    const spyAddEventListener = jest.spyOn(rootEle, 'addEventListener');

    spyAddEventListener.mockImplementationOnce(
      (_, cb) => typeof cb === 'function' && cb({} as Event),
    );

    await waitFor(() => screen.findByShadowText('It updated!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('should call next with token when url contains "t" query param', async () => {
    nextMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<span>It works!</span>';

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_TOKEN_PARAM_NAME}=token1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith('0', '0', 'submit', 1, '1.2.3', {
        token: 'token1',
      }),
    );
    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('should call next with token when url contains "code" query param', async () => {
    nextMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<span>It works!</span>';

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_CODE_PARAM_NAME}=code1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="flow-1" project-id="1"></descope-wc>`;

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith('0', '0', 'submit', 0, '1.2.3', {
        exchangeCode: 'code1',
      }),
    );
    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('should call next with exchangeError when url contains "err" query param', async () => {
    nextMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<span>It works!</span>';

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_ERR_PARAM_NAME}=err1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith('0', '0', 'submit', 1, '1.2.3', {
        exchangeError: 'err1',
      }),
    );
    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('When clicking a button it should collect all the descope attributes and call next with it', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent = `<descope-button type="button" id="123" ${DESCOPE_ATTRIBUTE_PREFIX}attr1='attr1' ${DESCOPE_ATTRIBUTE_PREFIX}attr2='attr2'>Click</descope-button>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('Click'), {
      timeout: WAIT_TIMEOUT,
    });

    pageContent =
      '<input id="email"></input><input id="code"></input><span>It works!</span>';

    fireEvent.click(screen.getByShadowText('Click'));

    await waitFor(() =>
      expect(nextMock).toBeCalledWith('0', '0', '123', 1, '1.2.3', {
        attr1: 'attr1',
        attr2: 'attr2',
        origin: 'http://localhost',
      }),
    );
  });

  it('Submitter button should have a loading class when next is pending', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    let resolve: Function;
    nextMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );

    pageContent = `<descope-button type="button" id="123" ${DESCOPE_ATTRIBUTE_PREFIX}attr1='attr1' ${DESCOPE_ATTRIBUTE_PREFIX}attr2='attr2'>Click</descope-button>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('Click'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('Click'));

    await waitFor(() =>
      expect(screen.getByShadowText('Click')).toHaveAttribute(
        'loading',
        'true',
      ),
    );

    resolve(generateSdkResponse({ screenId: '1' }));

    await waitFor(
      () => expect(screen.getByShadowText('Click')).not.toHaveClass('loading'),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('When action type is "redirect" it navigates to the "redirectUrl" that is received from the server', async () => {
    nextMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.redirect,
        redirectUrl: 'https://myurl.com',
      }),
    );

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_CODE_PARAM_NAME}=code1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(
      () =>
        expect(window.location.assign).toHaveBeenCalledWith(
          'https://myurl.com',
        ),
      {
        timeout: WAIT_TIMEOUT,
      },
    );
  });

  it('When action type is "redirect" it calls location.assign one time only', async () => {
    nextMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.redirect,
        redirectUrl: 'https://myurl.com',
      }),
    );

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_CODE_PARAM_NAME}=code1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(
      () => expect(window.location.assign).toHaveBeenCalledTimes(1),
      {
        timeout: WAIT_TIMEOUT,
      },
    );
  });

  it('When action type is "redirect" and redirectUrl is missing should log an error ', async () => {
    startMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.redirect,
      }),
    );

    const errorSpy = jest.spyOn(console, 'error');

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(
      () =>
        expect(errorSpy).toHaveBeenCalledWith(
          'Did not get redirect url',
          '',
          expect.any(Error),
        ),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('When action type is "redirect" and redirect auth initiator is android navigates to the "redirectUrl" only in foreground', async () => {
    nextMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.redirect,
        redirectUrl: 'https://myurl.com',
      }),
    );

    // Start hidden (in background)
    let isHidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get() {
        return isHidden;
      },
    });

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_CODE_PARAM_NAME}=code1&${URL_REDIRECT_AUTH_INITIATOR_PARAM_NAME}=android`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    // Make sure no redirect happened
    await waitFor(() => expect(nextMock).toHaveBeenCalled(), {
      timeout: WAIT_TIMEOUT,
    });
    expect(window.location.assign).not.toHaveBeenCalledWith(
      'https://myurl.com',
    );

    // Back to the foreground
    isHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(
      () =>
        expect(window.location.assign).toHaveBeenCalledWith(
          'https://myurl.com',
        ),
      {
        timeout: WAIT_TIMEOUT,
      },
    );
  });

  it('When action type is "redirect" and redirect auth initiator is not android navigates to the "redirectUrl" even in background', async () => {
    nextMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.redirect,
        redirectUrl: 'https://myurl.com',
      }),
    );

    // Start hidden (in background)
    const isHidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get() {
        return isHidden;
      },
    });

    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_CODE_PARAM_NAME}=code1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    // Make sure no redirect happened
    await waitFor(() => expect(nextMock).toHaveBeenCalled(), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(
      () =>
        expect(window.location.assign).toHaveBeenCalledWith(
          'https://myurl.com',
        ),
      {
        timeout: WAIT_TIMEOUT,
      },
    );
  });

  it('When response has "openInNewTabUrl" it opens the URL in a new window', async () => {
    nextMock.mockReturnValueOnce(
      generateSdkResponse({
        openInNewTabUrl: 'https://loremipsumurl.com',
      }),
    );

    pageContent = '<span>It works!</span>';
    window.location.search = `?${URL_RUN_IDS_PARAM_NAME}=0_0&${URL_CODE_PARAM_NAME}=code1`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    // Make sure url is opened in a new tab
    await waitFor(
      () =>
        expect(window.open).toHaveBeenCalledWith(
          'https://loremipsumurl.com',
          '_blank',
        ),
      {
        timeout: WAIT_TIMEOUT,
      },
    );

    // Should also show the screen
    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
  });

  it('When action type is "webauthnCreate" and webauthnTransactionId is missing should log an error ', async () => {
    startMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.webauthnCreate,
      }),
    );

    const errorSpy = jest.spyOn(console, 'error');

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(
      () =>
        expect(errorSpy).toHaveBeenCalledWith(
          'Did not get webauthn transaction id or options',
          '',
          expect.any(Error),
        ),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('Should create new credentials when action type is "webauthnCreate"', async () => {
    startMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.webauthnCreate,
        webAuthnTransactionId: 't1',
        webAuthnOptions: 'options',
      }),
    );
    pageContent = '<span>It works!</span>';

    nextMock.mockReturnValueOnce(generateSdkResponse());

    sdk.webauthn.helpers.create.mockReturnValueOnce(
      Promise.resolve('webauthn-response'),
    );

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="webauthn_signup" project-id="1"></descope-wc>`;

    await waitFor(
      () => expect(sdk.webauthn.helpers.create).toHaveBeenCalled(),
      { timeout: WAIT_TIMEOUT },
    );
    expect(nextMock).toHaveBeenCalledWith('0', '0', 'submit', 0, '1.2.3', {
      transactionId: 't1',
      response: 'webauthn-response',
    });
  });

  it('Should search of existing credentials when action type is "webauthnGet"', async () => {
    startMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.webauthnGet,
        webAuthnTransactionId: 't1',
        webAuthnOptions: 'options',
      }),
    );

    pageContent = '<span>It works!</span>';

    nextMock.mockReturnValueOnce(generateSdkResponse());

    sdk.webauthn.helpers.get.mockReturnValueOnce(
      Promise.resolve('webauthn-response-get'),
    );

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

    await waitFor(() => expect(sdk.webauthn.helpers.get).toHaveBeenCalled(), {
      timeout: WAIT_TIMEOUT,
    });
    expect(nextMock).toHaveBeenCalledWith('0', '0', 'submit', 1, '1.2.3', {
      transactionId: 't1',
      response: 'webauthn-response-get',
    });
  });

  it('Should handle canceling webauthn', async () => {
    startMock.mockReturnValueOnce(
      generateSdkResponse({
        action: RESPONSE_ACTIONS.webauthnGet,
        webAuthnTransactionId: 't1',
        webAuthnOptions: 'options',
      }),
    );

    pageContent = '<span>It works!</span>';

    nextMock.mockReturnValueOnce(generateSdkResponse());

    sdk.webauthn.helpers.get.mockReturnValueOnce(
      Promise.reject(new DOMException('', 'NotAllowedError')),
    );

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="webauthn_signup" project-id="1"></descope-wc>`;

    await waitFor(() => expect(sdk.webauthn.helpers.get).toHaveBeenCalled(), {
      timeout: WAIT_TIMEOUT,
    });
    expect(nextMock).toHaveBeenCalledWith('0', '0', 'submit', 0, '1.2.3', {
      transactionId: 't1',
      failure: 'NotAllowedError',
    });
  });

  it('it loads the fonts from the config when loading', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    configContent = {
      ...configContent,
      cssTemplate: {
        light: { fonts: { font1: { url: 'font.url' } } },
      },
    };

    pageContent =
      '<descope-button id="submitterId">click</descope-button><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" theme="light" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('It works!'), {
      timeout: 10000,
    });

    await waitFor(
      () =>
        expect(
          document.head.querySelector(`link[href="font.url"]`),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  }, 20000);

  it('loads flow start screen if its in config file', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    configContent = {
      ...configContent,
      flows: {
        'sign-in': { startScreenId: 'screen-0' },
      },
    };

    pageContent = '<div>hey</div>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(startMock).not.toBeCalled();
    const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/screen-0.html`;

    const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(htmlUrlPathRegex),
      expect.any(Object),
    );
  });

  it('runs fingerprint when config contains the correct fields', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    configContent = {
      flows: {
        'sign-in': {
          startScreenId: 'screen-0',
          fingerprintEnabled: true,
          fingerprintKey: 'fp-public-key',
        },
      },
    };

    pageContent = '<div>hey</div>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1" base-url="http://base.url"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(ensureFingerprintIds).toHaveBeenCalledWith(
      'fp-public-key',
      'http://base.url',
    );
  });

  it('should load sdk script when flow configured with sdk script', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    // We use specific connector which exists to test it all end to end
    // but we override it above
    const scriptId = 'forter';
    const resultKey = 'some-result-key';
    const resultValue = 'some-value';

    configContent = {
      flows: {
        'sign-in': {
          startScreenId: 'screen-0',
          sdkScripts: [
            {
              id: scriptId,
              initArgs: {
                siteId: 'some-site-id',
              },
              resultKey,
            },
          ],
        },
      },
    };

    pageContent = `<descope-button type="button" id="interactionId">Click</descope-button>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1" base-url="http://base.url"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('Click'), {
      timeout: WAIT_TIMEOUT,
    });

    // ensure loadForter is called
    expect(loadForter).toHaveBeenCalledWith(
      {
        siteId: 'some-site-id',
      },
      expect.objectContaining({
        baseUrl: 'http://base.url',
      }),
      expect.any(Function),
    );

    // trigger the callback, to simulate the script loaded
    // get the 3rd argument of the first call to loadForter
    const callback = (loadForter as jest.Mock).mock.calls[0][2];
    callback(resultValue);

    fireEvent.click(screen.getByShadowText('Click'));

    await waitFor(() => expect(startMock).toHaveBeenCalled());

    // Get start input is the 6th argument of the first call to start
    // ensure the result is passed to the start input
    const startInput = startMock.mock.calls[0][6];
    expect(startInput).toEqual(
      expect.objectContaining({
        [`${SDK_SCRIPT_RESULTS_KEY}.${scriptId}_${resultKey}`]: resultValue,
      }),
    );
  });

  it('it should set the theme based on the user parameter', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1" theme="light"></descope-wc>`;

    const shadowEle = document.getElementsByTagName('descope-wc')[0].shadowRoot;

    const rootEle = shadowEle?.querySelector('#root');

    await waitFor(() => expect(rootEle).toHaveAttribute('data-theme', 'light'));
  });

  it('it should set the theme based on OS settings when theme is "os"', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    window.matchMedia = jest.fn(() => ({ matches: true })) as any;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1" theme="os"></descope-wc>`;

    const shadowEle = document.getElementsByTagName('descope-wc')[0].shadowRoot;

    const rootEle = shadowEle?.querySelector('#root');

    await waitFor(() => expect(rootEle).toHaveAttribute('data-theme', 'dark'));
  });

  it('it should set the theme to light if not provided', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    window.matchMedia = jest.fn(() => ({ matches: true })) as any;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    const shadowEle = document.getElementsByTagName('descope-wc')[0].shadowRoot;

    const rootEle = shadowEle?.querySelector('#root');

    await waitFor(() => expect(rootEle).toHaveAttribute('data-theme', 'light'));
  });

  it('should throw an error when theme has a wrong value', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    class Test extends DescopeWc {
      constructor() {
        super();
        Object.defineProperty(this, 'shadowRoot', {
          value: {
            isConnected: true,
            appendChild: () => {},
            host: { closest: () => true },
          },
        });
      }

      // eslint-disable-next-line class-methods-use-this
      public get projectId() {
        return '1';
      }

      // eslint-disable-next-line class-methods-use-this
      public get flowId() {
        return '1';
      }
    }

    customElements.define('test-theme', Test as any);
    document.body.innerHTML = `<h1>Custom element test</h1> <test-theme flow-id="otpSignInEmail" project-id="1" theme="lol"></descope-wc>`;

    await waitFor(
      () =>
        expect(errorSpy).toHaveBeenCalledWith(
          'Supported theme values are "light", "dark", or leave empty for using the OS theme',
        ),
      { timeout: WAIT_TIMEOUT },
    );
  });

  it('should show form validation error when input is not valid', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent =
      '<descope-button id="submitterId">click</descope-button><input id="email" name="email" required placeholder="email" class="descope-input"></input><span>hey</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('click'), {
      timeout: WAIT_TIMEOUT,
    });

    const buttonEle = await screen.findByShadowText('click');

    const inputEle = screen.getByShadowPlaceholderText(
      'email',
    ) as HTMLInputElement;

    inputEle.reportValidity = jest.fn();
    inputEle.checkValidity = jest.fn();

    fireEvent.click(buttonEle);

    await waitFor(() => expect(inputEle.reportValidity).toHaveBeenCalled(), {
      timeout: WAIT_TIMEOUT,
    });

    await waitFor(() => expect(inputEle.checkValidity).toHaveBeenCalled());
  });

  it('should call start with redirect url when provided', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent =
      '<descope-button id="submitterId">click</descope-button><input id="email" name="email"></input><span>hey</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1" redirect-url="http://custom.url"></descope-wc>`;

    await waitFor(() => screen.findByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });

    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        expect.objectContaining({ redirectUrl: 'http://custom.url' }),
        undefined,
        '',
        0,
        '1.2.3',
        {},
      ),
    );
  });

  it('should call start with form and client when provided', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<div>hey</div>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1" form='{"displayName": "dn", "email": "test", "nested": { "key": "value" }, "another": { "value": "a", "disabled": true }}' client='{"email": "test2", "nested": { "key": "value" }}'></descope-wc>`;

    await waitFor(() => screen.findByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });

    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        expect.objectContaining({
          client: {
            email: 'test2',
            nested: { key: 'value' },
          },
        }),
        undefined,
        '',
        0,
        '1.2.3',
        {
          email: 'test',
          'form.email': 'test',
          'nested.key': 'value',
          'form.nested.key': 'value',
          another: 'a',
          'form.another': 'a',
          'form.displayName': 'dn',
          'form.fullName': 'dn',
          displayName: 'dn',
          fullName: 'dn',
        },
      ),
    );
  });

  describe('poll', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('Should clear timeout when user clicks a button', async () => {
      jest.spyOn(global, 'clearTimeout');

      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent =
        '<descope-button id="submitterId">click</descope-button><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      jest.runAllTimers();

      await waitFor(() => screen.findByShadowText('It works!'), {
        timeout: 10000,
      });

      /*  next returns
         - a poll response
         - another poll response
         - a screen response
      */
      nextMock
        .mockReturnValueOnce(
          generateSdkResponse({
            executionId: 'e1',
            stepId: 's1',
            screenId: '1',
            action: RESPONSE_ACTIONS.poll,
          }),
        )
        .mockReturnValueOnce(
          generateSdkResponse({
            action: RESPONSE_ACTIONS.poll,
          }),
        )
        .mockReturnValueOnce(
          generateSdkResponse({
            screenId: '2',
          }),
        );

      fireEvent.click(screen.getByShadowText('click'));

      // first call is the click call
      await waitFor(() =>
        expect(nextMock).toHaveBeenNthCalledWith(
          1,
          '0',
          '0',
          'submitterId',
          1,
          '1.2.3',
          expect.any(Object),
        ),
      );

      // first call is the click call
      await waitFor(
        () =>
          expect(nextMock).toHaveBeenNthCalledWith(
            2,
            '0',
            '0',
            CUSTOM_INTERACTIONS.polling,
            1,
            '1.2.3',
            expect.any(Object),
          ),
        {
          timeout: 8000,
        },
      );

      // second call is the click call
      await waitFor(
        () =>
          expect(nextMock).toHaveBeenNthCalledWith(
            3,
            '0',
            '0',
            CUSTOM_INTERACTIONS.polling,
            1,
            '1.2.3',
            expect.any(Object),
          ),
        {
          timeout: 8000,
        },
      );

      await waitFor(() => expect(clearTimeout).toHaveBeenCalled(), {
        timeout: 8000,
      });
    });

    it('When has polling element - next with "polling", and check that timeout is set properly', async () => {
      jest.spyOn(global, 'setTimeout');

      startMock.mockReturnValueOnce(generateSdkResponse());

      nextMock.mockReturnValueOnce(
        generateSdkResponse({
          action: RESPONSE_ACTIONS.poll,
        }),
      );

      pageContent = '<div data-type="polling">...</div><span>It works!</span>';
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      jest.runAllTimers();

      await waitFor(
        () =>
          expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000),
        {
          timeout: WAIT_TIMEOUT,
        },
      );
    });

    it('When screen has polling element and next returns the same response, should trigger polling again', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      nextMock.mockReturnValueOnce(
        generateSdkResponse({
          action: RESPONSE_ACTIONS.poll,
        }),
      );

      pageContent =
        '<div data-type="polling">...</div><descope-button>click</descope-button><span>It works!</span>';
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      // Wait for first polling
      await waitFor(
        () =>
          expect(nextMock).toHaveBeenCalledWith(
            '0',
            '0',
            CUSTOM_INTERACTIONS.polling,
            1,
            '1.2.3',
            {},
          ),
        {
          timeout: WAIT_TIMEOUT,
        },
      );

      // Reset mock to ensure it is triggered again with polling
      nextMock.mockClear();
      nextMock.mockReturnValueOnce(
        generateSdkResponse({
          action: RESPONSE_ACTIONS.poll,
        }),
      );

      // Click another button, which returns the same screen
      fireEvent.click(screen.getByShadowText('click'));

      // Ensure polling is triggered again
      await waitFor(
        () =>
          expect(nextMock).toHaveBeenCalledWith(
            '0',
            '0',
            CUSTOM_INTERACTIONS.polling,
            1,
            '1.2.3',
            {},
          ),
        {
          timeout: WAIT_TIMEOUT,
        },
      );
    });

    it('When has polling element, and next poll returns polling response', async () => {
      jest.spyOn(global, 'setTimeout');

      startMock.mockReturnValueOnce(generateSdkResponse());

      nextMock.mockReturnValue(
        generateSdkResponse({
          action: RESPONSE_ACTIONS.poll,
        }),
      );

      pageContent = '<div data-type="polling">...</div><span>It works!</span>';
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      jest.runAllTimers();

      await waitFor(() => expect(nextMock).toHaveBeenCalledTimes(3), {
        timeout: WAIT_TIMEOUT * 2,
      });
    });

    it('When has polling element, and next poll returns completed response', async () => {
      jest.spyOn(global, 'setTimeout');

      startMock.mockReturnValueOnce(generateSdkResponse());

      nextMock
        .mockReturnValueOnce(
          generateSdkResponse({
            action: RESPONSE_ACTIONS.poll,
          }),
        )
        .mockReturnValueOnce(
          generateSdkResponse({
            status: 'completed',
          }),
        );

      pageContent = '<div data-type="polling">...</div><span>It works!</span>';
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      const onSuccess = jest.fn();

      const wcEle = document.getElementsByTagName('descope-wc')[0];

      wcEle.addEventListener('success', onSuccess);

      jest.runAllTimers();

      await waitFor(() => expect(nextMock).toHaveBeenCalledTimes(2), {
        timeout: WAIT_TIMEOUT,
      });

      await waitFor(
        () =>
          expect(onSuccess).toHaveBeenCalledWith(
            expect.objectContaining({ detail: 'auth info' }),
          ),
        {
          timeout: WAIT_TIMEOUT,
        },
      );

      wcEle.removeEventListener('success', onSuccess);
    });
  });

  describe('condition', () => {
    beforeEach(() => {
      localStorage.removeItem(DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY);
    });
    it('Should fetch met screen when condition is met', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      localStorage.setItem(
        DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
        '{"authMethod":"otp"}',
      );
      getLastUserLoginIdMock.mockReturnValue('abc');

      configContent = {
        ...configContent,
        flows: {
          'sign-in': {
            condition: {
              key: 'lastAuth.loginId',
              met: {
                interactionId: 'gbutpyzvtgs',
                screenId: 'met',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          },
        },
      };

      pageContent = '<div>hey</div>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('hey'), {
        timeout: WAIT_TIMEOUT,
      });
      expect(startMock).not.toBeCalled();
      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/met.html`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );
    });

    it('Should fetch unmet screen when condition is not met', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      localStorage.setItem(
        DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
        '{"authMethod":"otp"}',
      );

      configContent = {
        ...configContent,
        flows: {
          'sign-in': {
            condition: {
              key: 'lastAuth.loginId',
              met: {
                interactionId: 'gbutpyzvtgs',
                screenId: 'met',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          },
        },
      };

      pageContent = '<div>hey</div>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('hey'), {
        timeout: WAIT_TIMEOUT,
      });
      expect(startMock).not.toBeCalled();
      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/unmet.html`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );
    });

    it('Should send condition interaction ID on submit click', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      localStorage.setItem(
        DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
        '{"authMethod":"otp"}',
      );
      getLastUserLoginIdMock.mockReturnValue('abc');

      const conditionInteractionId = 'gbutpyzvtgs';
      configContent = {
        ...configContent,
        flows: {
          'sign-in': {
            condition: {
              key: 'lastAuth.loginId',
              met: {
                interactionId: conditionInteractionId,
                screenId: 'met',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            version: 1,
          },
        },
      };

      pageContent = `<descope-button type="button" id="interactionId">Click</descope-button>`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => screen.findByShadowText('Click'), {
        timeout: WAIT_TIMEOUT,
      });

      pageContent =
        '<input id="email"></input><input id="code"></input><span>It works!</span>';

      fireEvent.click(screen.getByShadowText('Click'));

      await waitFor(() =>
        expect(startMock).toBeCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            lastAuth: { authMethod: 'otp' },
            preview: false,
          },
          conditionInteractionId,
          'interactionId',
          1,
          '1.2.3',
          { origin: 'http://localhost' },
        ),
      );
    });
    it('Should call start with code and idpInitiated when idpInitiated condition is met', async () => {
      window.location.search = `?${URL_CODE_PARAM_NAME}=code1`;
      localStorage.setItem(
        DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
        '{"authMethod":"otp"}',
      );
      getLastUserLoginIdMock.mockReturnValue('abc');
      configContent = {
        ...configContent,
        flows: {
          'sign-in': {
            condition: {
              key: 'idpInitiated',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            version: 1,
          },
        },
      };

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;
      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            lastAuth: { authMethod: 'otp' },
          },
          undefined,
          '',
          1,
          '1.2.3',
          {
            exchangeCode: 'code1',
            idpInitiated: true,
          },
        ),
      );
    });

    it('Should fetch unmet screen when idpInitiated condition is not met', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      configContent = {
        ...configContent,
        flows: {
          'sign-in': {
            condition: {
              key: 'idpInitiated',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'is-true',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          },
        },
      };

      pageContent = '<div>hey</div>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('hey'), {
        timeout: WAIT_TIMEOUT,
      });
      expect(startMock).not.toBeCalled();
      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/unmet.html`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );
    });

    it('Should call start with token and externalToken when externalToken condition is met', async () => {
      window.location.search = `?${URL_TOKEN_PARAM_NAME}=code1`;
      localStorage.setItem(
        DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
        '{"authMethod":"otp"}',
      );
      getLastUserLoginIdMock.mockReturnValue('abc');
      configContent = {
        flows: {
          'sign-in': {
            condition: {
              key: 'externalToken',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            version: 1,
          },
        },
      };

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;
      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            lastAuth: { authMethod: 'otp' },
          },
          undefined,
          '',
          1,
          undefined,
          {
            token: 'code1',
          },
        ),
      );
    });

    it('Should fetch unmet screen when externalToken condition is not met', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      configContent = {
        flows: {
          'sign-in': {
            condition: {
              key: 'externalToken',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'is-true',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          },
        },
      };

      pageContent = '<div>hey</div>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('hey'), {
        timeout: WAIT_TIMEOUT,
      });
      expect(startMock).not.toBeCalled();
      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/unmet.html`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );
    });

    it('should call start with redirect auth data and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';

      const challenge = window.btoa('hash');
      const callback = 'https://mycallback.com';
      const backupCallback = 'myapp://auth';
      const encodedChallenge = encodeURIComponent(challenge);
      const encodedCallback = encodeURIComponent(callback);
      const encodedBackupCallback = encodeURIComponent(backupCallback);
      window.location.search = `?${URL_REDIRECT_AUTH_CHALLENGE_PARAM_NAME}=${encodedChallenge}&${URL_REDIRECT_AUTH_CALLBACK_PARAM_NAME}=${encodedCallback}&${URL_REDIRECT_AUTH_BACKUP_CALLBACK_PARAM_NAME}=${encodedBackupCallback}&${URL_REDIRECT_AUTH_INITIATOR_PARAM_NAME}=android`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            redirectAuth: {
              callbackUrl: callback,
              codeChallenge: challenge,
              backupCallbackUri: backupCallback,
            },
          },
          undefined,
          '',
          0,
          '1.2.3',
          {},
        ),
      );
      await waitFor(() => screen.findByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('should call start with redirect auth data and token and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';
      const token = 'token1';
      const challenge = window.btoa('hash');
      const callback = 'https://mycallback.com';
      const encodedChallenge = encodeURIComponent(challenge);
      const encodedCallback = encodeURIComponent(callback);
      window.location.search = `?${URL_REDIRECT_AUTH_CHALLENGE_PARAM_NAME}=${encodedChallenge}&${URL_REDIRECT_AUTH_CALLBACK_PARAM_NAME}=${encodedCallback}&${URL_REDIRECT_AUTH_INITIATOR_PARAM_NAME}=android&${URL_TOKEN_PARAM_NAME}=${token}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            redirectAuth: {
              callbackUrl: callback,
              codeChallenge: challenge,
              backupCallbackUri: null,
            },
          },
          undefined,
          '',
          0,
          '1.2.3',
          { token },
        ),
      );
      await waitFor(() => screen.findByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('should call start with oidc idp flag and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';

      const oidcIdpStateId = 'abcdefgh';
      const encodedOidcIdpStateId = encodeURIComponent(oidcIdpStateId);
      window.location.search = `?${OIDC_IDP_STATE_ID_PARAM_NAME}=${encodedOidcIdpStateId}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            oidcIdpStateId: 'abcdefgh',
          },
          undefined,
          '',
          0,
          '1.2.3',
          {},
        ),
      );
      await waitFor(() => screen.findByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('should call start with oidc idp when there is a start screen is configured', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      configContent = {
        ...configContent,
        flows: {
          'sign-in': { startScreenId: 'screen-0' },
        },
      };

      pageContent =
        '<descope-button>click</descope-button><span>It works!</span>';

      const oidcIdpStateId = 'abcdefgh';
      const encodedOidcIdpStateId = encodeURIComponent(oidcIdpStateId);
      window.location.search = `?${OIDC_IDP_STATE_ID_PARAM_NAME}=${encodedOidcIdpStateId}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => expect(startMock).toHaveBeenCalled());

      await waitFor(() => screen.findByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(() => expect(nextMock).toHaveBeenCalled(), {
        timeout: WAIT_TIMEOUT,
      });
    });

    it('should call start with saml idp when there is a start screen is configured', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      configContent = {
        flows: {
          'sign-in': { startScreenId: 'screen-0' },
        },
      };

      pageContent =
        '<descope-button>click</descope-button><span>It works!</span>';

      const samlIdpStateId = 'abcdefgh';
      const encodedSamlIdpStateId = encodeURIComponent(samlIdpStateId);
      window.location.search = `?${SAML_IDP_STATE_ID_PARAM_NAME}=${encodedSamlIdpStateId}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => expect(startMock).toHaveBeenCalled());

      await waitFor(() => screen.findByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(() => expect(nextMock).toHaveBeenCalled(), {
        timeout: WAIT_TIMEOUT,
      });
    });

    it('should call start with saml idp with username when there is a start screen is configured', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      configContent = {
        flows: {
          'sign-in': { startScreenId: 'screen-0' },
        },
      };

      pageContent =
        '<descope-button>click</descope-button><span>It works!</span>';

      const samlIdpUsername = 'abcdefgh';
      const encodedSamlIdpUsername = encodeURIComponent(samlIdpUsername);
      window.location.search = `?${SAML_IDP_USERNAME_PARAM_NAME}=${encodedSamlIdpUsername}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => expect(startMock).toHaveBeenCalled());

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(() => expect(nextMock).toHaveBeenCalled());
    });

    it('should call start with saml idp flag and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';

      const samlIdpStateId = 'abcdefgh';
      const encodedSamlIdpStateId = encodeURIComponent(samlIdpStateId);
      window.location.search = `?${SAML_IDP_STATE_ID_PARAM_NAME}=${encodedSamlIdpStateId}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            samlIdpStateId: 'abcdefgh',
          },
          undefined,
          '',
          0,
          '1.2.3',
          {},
        ),
      );
      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('should call start with saml idp with username flag and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';

      const samlIdpStateId = 'abcdefgh';
      const encodedSamlIdpStateId = encodeURIComponent(samlIdpStateId);
      const samlIdpUsername = 'dummyUser';
      const encodedSamlIdpUsername = encodeURIComponent(samlIdpUsername);
      window.location.search = `?${SAML_IDP_STATE_ID_PARAM_NAME}=${encodedSamlIdpStateId}&${SAML_IDP_USERNAME_PARAM_NAME}=${encodedSamlIdpUsername}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            samlIdpStateId: 'abcdefgh',
            samlIdpUsername: 'dummyUser',
          },
          undefined,
          '',
          0,
          '1.2.3',
          {},
        ),
      );
      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('should call start with descope idp initiated flag and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';

      const descopeIdpInitiated = 'true';
      window.location.search = `?${DESCOPE_IDP_INITIATED_PARAM_NAME}=${descopeIdpInitiated}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            descopeIdpInitiated: true,
          },
          undefined,
          '',
          0,
          '1.2.3',
          {
            idpInitiated: true,
          },
        ),
      );
      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('should call start with ssoAppId when there is a start screen is configured', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      configContent = {
        flows: {
          'sign-in': { startScreenId: 'screen-0' },
        },
      };

      pageContent =
        '<descope-button>click</descope-button><span>It works!</span>';

      const ssoAppId = 'abcdefgh';
      const encodedSSOAppId = encodeURIComponent(ssoAppId);
      window.location.search = `?${SSO_APP_ID_PARAM_NAME}=${encodedSSOAppId}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() => expect(startMock).toHaveBeenCalled());

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(() => expect(nextMock).toHaveBeenCalled(), {
        timeout: WAIT_TIMEOUT,
      });
    });

    it('should call start with ssoAppId flag and clear it from url', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = '<span>It works!</span>';

      const ssoAppId = 'abcdefgh';
      const encodedSSOAppId = encodeURIComponent(ssoAppId);
      window.location.search = `?${SSO_APP_ID_PARAM_NAME}=${encodedSSOAppId}`;
      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

      await waitFor(() =>
        expect(startMock).toHaveBeenCalledWith(
          'sign-in',
          {
            ...defaultOptionsValues,
            ssoAppId: 'abcdefgh',
          },
          undefined,
          '',
          0,
          '1.2.3',
          {},
        ),
      );
      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });
      await waitFor(() => expect(window.location.search).toBe(''));
    });
  });

  it('should call start with oidc idp with oidcLoginHint flag and clear it from url', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<span>It works!</span>';

    const oidcStateId = 'abcdefgh';
    const encodedOidcStateId = encodeURIComponent(oidcStateId);
    const oidcLoginHint = 'dummyUser';
    const encodedOidcLoginHint = encodeURIComponent(oidcLoginHint);
    window.location.search = `?${OIDC_IDP_STATE_ID_PARAM_NAME}=${encodedOidcStateId}&${OIDC_LOGIN_HINT_PARAM_NAME}=${encodedOidcLoginHint}`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        {
          ...defaultOptionsValues,
          oidcIdpStateId: 'abcdefgh',
          oidcLoginHint: 'dummyUser',
        },
        undefined,
        '',
        0,
        '1.2.3',
        {
          externalId: 'dummyUser',
        },
      ),
    );
    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('should call start with oidc idp with loginHint when there is a start screen is configured', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    configContent = {
      flows: {
        'sign-in': { startScreenId: 'screen-0' },
      },
    };

    pageContent =
      '<descope-button>click</descope-button><span>It works!</span>';

    const oidcLoginHint = 'abcdefgh';
    const encodedOidcLoginHint = encodeURIComponent(oidcLoginHint);
    window.location.search = `?${OIDC_LOGIN_HINT_PARAM_NAME}=${encodedOidcLoginHint}`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => expect(startMock).toHaveBeenCalled());

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() => expect(nextMock).toHaveBeenCalled());
  });

  it('should call start with oidc idp with oidcPrompt flag and clear it from url', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<span>It works!</span>';

    const oidcStateId = 'abcdefgh';
    const encodedOidcStateId = encodeURIComponent(oidcStateId);
    const oidcPrompt = 'login';
    const encodedOidcPrompt = encodeURIComponent(oidcPrompt);
    window.location.search = `?${OIDC_IDP_STATE_ID_PARAM_NAME}=${encodedOidcStateId}&${OIDC_PROMPT_PARAM_NAME}=${encodedOidcPrompt}`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        {
          ...defaultOptionsValues,
          oidcIdpStateId: 'abcdefgh',
          oidcPrompt: 'login',
        },
        undefined,
        '',
        0,
        '1.2.3',
        {},
      ),
    );
    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('should call start with oidc idp with oidcPrompt when there is a start screen is configured', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    configContent = {
      flows: {
        'sign-in': { startScreenId: 'screen-0' },
      },
    };

    pageContent =
      '<descope-button>click</descope-button><span>It works!</span>';

    const oidcPrompt = 'login';
    const encodedOidcPrompt = encodeURIComponent(oidcPrompt);
    window.location.search = `?${OIDC_PROMPT_PARAM_NAME}=${encodedOidcPrompt}`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => expect(startMock).toHaveBeenCalled());

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() => expect(nextMock).toHaveBeenCalled());
  });

  it('should call start with oidc idp with oidcErrorRedirectUri flag and clear it from url', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    pageContent = '<span>It works!</span>';

    const oidcStateId = 'abcdefgh';
    const encodedOidcStateId = encodeURIComponent(oidcStateId);
    const oidcErrorRedirectUri = 'https://some.test';
    const encodedOidcErrorRedirectUri =
      encodeURIComponent(oidcErrorRedirectUri);
    window.location.search = `?${OIDC_IDP_STATE_ID_PARAM_NAME}=${encodedOidcStateId}&${OIDC_ERROR_REDIRECT_URI_PARAM_NAME}=${encodedOidcErrorRedirectUri}`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        {
          ...defaultOptionsValues,
          oidcIdpStateId: 'abcdefgh',
          oidcErrorRedirectUri: 'https://some.test',
        },
        undefined,
        '',
        0,
        '1.2.3',
        {},
      ),
    );
    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('should call start with oidc idp with oidcErrorRedirectUri when there is a start screen is configured', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());

    configContent = {
      flows: {
        'sign-in': { startScreenId: 'screen-0' },
      },
    };

    pageContent =
      '<descope-button>click</descope-button><span>It works!</span>';

    const oidcErrorRedirectUri = 'https://some.test';
    const encodedOidcErrorRedirectUri =
      encodeURIComponent(oidcErrorRedirectUri);
    window.location.search = `?${OIDC_ERROR_REDIRECT_URI_PARAM_NAME}=${encodedOidcErrorRedirectUri}`;
    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => expect(startMock).toHaveBeenCalled());

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    fireEvent.click(screen.getByShadowText('click'));

    await waitFor(() => expect(nextMock).toHaveBeenCalled());
  });

  it('Should call start with code and idpInitiated when idpInitiated condition is met in multiple conditions', async () => {
    window.location.search = `?${URL_CODE_PARAM_NAME}=code1`;
    configContent = {
      ...configContent,
      flows: {
        'sign-in': {
          conditions: [
            {
              key: 'idpInitiated',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          ],
          version: 1,
        },
      },
    };

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;
    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        defaultOptionsValues,
        undefined,
        '',
        1,
        '1.2.3',
        {
          exchangeCode: 'code1',
          idpInitiated: true,
        },
      ),
    );
  });

  it('Should call start with code and idpInitiated when idpInitiated condition is met in multiple conditions with last auth', async () => {
    window.location.search = `?${URL_CODE_PARAM_NAME}=code1`;
    configContent = {
      ...configContent,
      flows: {
        'sign-in': {
          conditions: [
            {
              key: 'idpInitiated',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            {
              key: 'lastAuth.loginId',
              met: {
                interactionId: 'gbutpyzvtgs',
                screenId: 'met',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          ],
          version: 1,
        },
      },
    };

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;
    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith(
        'sign-in',
        defaultOptionsValues,
        undefined,
        '',
        1,
        '1.2.3',
        {
          exchangeCode: 'code1',
          idpInitiated: true,
        },
      ),
    );
  });

  it('Should fetch met screen when second condition is met (also checks conditions with predicates)', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    localStorage.setItem(
      DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
      '{"authMethod":"otp"}',
    );
    getLastUserLoginIdMock.mockReturnValue('abc');

    configContent = {
      ...configContent,
      flows: {
        'sign-in': {
          conditions: [
            {
              key: 'idpInitiated',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'is-true',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            {
              key: 'abTestingKey',
              met: {
                interactionId: 'gbutpyzvtgs',
                screenId: 'met',
              },
              operator: 'greater-than',
              predicate: abTestingKey - 1,
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
          ],
        },
      },
    };

    pageContent = '<div>hey</div>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(startMock).not.toBeCalled();
    const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/met.html`;

    const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(htmlUrlPathRegex),
      expect.any(Object),
    );
  });
  it('Should fetch else screen when else is met', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    localStorage.setItem(
      DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY,
      '{"authMethod":"otp"}',
    );
    getLastUserLoginIdMock.mockReturnValue('');

    configContent = {
      ...configContent,
      flows: {
        'sign-in': {
          conditions: [
            {
              key: 'idpInitiated',
              met: {
                interactionId: 'gbutpyzvtgs',
              },
              operator: 'is-true',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            {
              key: 'lastAuth.loginId',
              met: {
                interactionId: 'gbutpyzvtgs',
                screenId: 'met',
              },
              operator: 'not-empty',
              unmet: {
                interactionId: 'ELSE',
                screenId: 'unmet',
              },
            },
            {
              key: 'ELSE',
              met: {
                interactionId: '123123',
                screenId: 'else',
              },
            },
          ],
        },
      },
    };

    pageContent = '<div>hey</div>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="sign-in" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('hey'), {
      timeout: WAIT_TIMEOUT,
    });
    expect(startMock).not.toBeCalled();
    const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/else.html`;

    const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(htmlUrlPathRegex),
      expect.any(Object),
    );
  });

  it('should call the success cb when flow in completed status', async () => {
    pageContent = '<input id="email" name="email"></input>';

    startMock.mockReturnValue(
      generateSdkResponse({
        ok: true,
        status: 'completed',
      }),
    );

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id=1></descope-wc>`;

    const wcEle = document.querySelector('descope-wc');

    const onSuccess = jest.fn();

    wcEle.addEventListener('success', onSuccess);

    await waitFor(
      () =>
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ detail: 'auth info' }),
        ),
      { timeout: WAIT_TIMEOUT },
    );

    wcEle.removeEventListener('success', onSuccess);
  });

  it('should not store last auth when use last authenticated user is false', async () => {
    localStorage.removeItem(DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY);

    pageContent = '<input id="email" name="email"></input>';

    startMock.mockReturnValue(
      generateSdkResponse({
        ok: true,
        status: 'completed',
        lastAuth: { authMethod: 'otp' },
      }),
    );

    document.body.innerHTML = `<h1>Custom element test</h1>
      <descope-wc flow-id="otpSignInEmail" project-id=1 store-last-authenticated-user="false">
    </descope-wc>`;

    const wcEle = document.querySelector('descope-wc');

    const onSuccess = jest.fn();

    wcEle.addEventListener('success', onSuccess);

    await waitFor(
      () =>
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ detail: 'auth info' }),
        ),
      { timeout: WAIT_TIMEOUT },
    );

    expect(
      localStorage.getItem(DESCOPE_LAST_AUTH_LOCAL_STORAGE_KEY),
    ).toBeNull();
  });

  it('should update dynamic attribute values', async () => {
    pageContent = `<input ${HAS_DYNAMIC_VALUES_ATTR_NAME}="" testAttr="{{form.varName}}" id="email" name="email" placeholder="email"></input>`;

    startMock.mockReturnValue(
      generateSdkResponse({
        screenState: {
          form: { varName: 'varValue' },
        },
      }),
    );

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id=1></descope-wc>`;

    const inputEle = await waitFor(
      () => screen.getByShadowPlaceholderText('email'),
      {
        timeout: WAIT_TIMEOUT,
      },
    );

    await waitFor(
      () => expect(inputEle).toHaveAttribute('testAttr', 'varValue'),
      { timeout: WAIT_TIMEOUT },
    );
  });

  describe('locale', () => {
    it('should fetch the data from the correct path when locale provided without target locales', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      pageContent = '<input id="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail locale="en-us"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0.html`;
      const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
      const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
      const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
      const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(themeUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(configUrlPathRegex),
        expect.any(Object),
      );
    });

    it(
      'should fetch the data from the correct path when locale provided with target locales',
      async () => {
        startMock.mockReturnValue(generateSdkResponse());

        configContent = {
          ...configContent,
          flows: {
            otpSignInEmail: {
              targetLocales: ['en-US'],
            },
          },
        };

        pageContent = '<input id="email"></input><span>It works!</span>';

        document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail" locale="en-Us"></descope-wc>`;

        await waitFor(() => screen.getByShadowText('It works!'), {
          timeout: WAIT_TIMEOUT,
        });

        const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0-en-us.html`;
        const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
        const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

        const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
        const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
        const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(htmlUrlPathRegex),
          expect.any(Object),
        );

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(themeUrlPathRegex),
          expect.any(Object),
        );

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(configUrlPathRegex),
          expect.any(Object),
        );
      },
      WAIT_TIMEOUT,
    );

    it('should fetch the data from the correct path when locale provided and not part of target locales', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      configContent = {
        ...configContent,
        flows: {
          otpSignInEmail: {
            targetLocales: ['de'],
          },
        },
      };

      pageContent = '<input id="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail" locale="en-us"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0.html`;
      const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
      const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
      const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
      const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(themeUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(configUrlPathRegex),
        expect.any(Object),
      );
    });

    it('should fetch the data from the correct path when locale provided in navigator', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      configContent = {
        ...configContent,
        flows: {
          otpSignInEmail: {
            targetLocales: ['en'],
          },
        },
      };

      Object.defineProperty(navigator, 'language', {
        value: 'en-Us',
        writable: true,
      });

      pageContent = '<input id="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0-en.html`;
      const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
      const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
      const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
      const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(themeUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(configUrlPathRegex),
        expect.any(Object),
      );

      Object.defineProperty(navigator, 'language', {
        value: '',
        writable: true,
      });
    });

    it('should fetch the data from the correct path when zh-TW locale provided in navigator', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      configContent = {
        flows: {
          otpSignInEmail: {
            targetLocales: ['zh-TW'],
          },
        },
      };

      Object.defineProperty(navigator, 'language', {
        value: 'zh-TW',
        writable: true,
      });

      pageContent = '<input id="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0-zh-tw.html`;
      const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
      const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
      const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
      const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(themeUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(configUrlPathRegex),
        expect.any(Object),
      );

      Object.defineProperty(navigator, 'language', {
        value: '',
        writable: true,
      });
    });

    it('should fetch the data from the correct path when locale provided in navigator but not in target locales', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      configContent = {
        ...configContent,
        flows: {
          otpSignInEmail: {
            targetLocales: ['de'],
          },
        },
      };

      Object.defineProperty(navigator, 'language', {
        value: 'en-Us',
        writable: true,
      });

      pageContent = '<input id="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0.html`;
      const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
      const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
      const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
      const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(themeUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(configUrlPathRegex),
        expect.any(Object),
      );

      Object.defineProperty(navigator, 'language', {
        value: '',
        writable: true,
      });
    });

    it('should fetch the data from the correct path when locale provided in navigator and request to locale fails', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      configContent = {
        ...configContent,
        flows: {
          otpSignInEmail: {
            targetLocales: ['en'],
          },
        },
      };

      const fn = fetchMock.getMockImplementation();
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('en.html')) {
          return { ok: false };
        }
        return fn(url);
      });

      Object.defineProperty(navigator, 'language', {
        value: 'en-Us',
        writable: true,
      });

      pageContent = '<input id="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      const expectedHtmlPath = `/pages/1/${ASSETS_FOLDER}/0-en.html`;
      const expectedHtmlFallbackPath = `/pages/1/${ASSETS_FOLDER}/0.html`;
      const expectedThemePath = `/pages/1/${ASSETS_FOLDER}/${THEME_DEFAULT_FILENAME}`;
      const expectedConfigPath = `/pages/1/${ASSETS_FOLDER}/${CONFIG_FILENAME}`;

      const htmlUrlPathRegex = new RegExp(`//[^/]+${expectedHtmlPath}$`);
      const htmlUrlFallbackPathRegex = new RegExp(
        `//[^/]+${expectedHtmlFallbackPath}$`,
      );
      const themeUrlPathRegex = new RegExp(`//[^/]+${expectedThemePath}$`);
      const configUrlPathRegex = new RegExp(`//[^/]+${expectedConfigPath}$`);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(htmlUrlFallbackPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(themeUrlPathRegex),
        expect.any(Object),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(configUrlPathRegex),
        expect.any(Object),
      );

      Object.defineProperty(navigator, 'language', {
        value: '',
        writable: true,
      });
    });
  });

  describe('SAML', () => {
    it('should validate handling of saml idp response', async () => {
      const samlUrl = 'http://acs.dummy.com';

      startMock.mockReturnValue(
        generateSdkResponse({
          ok: true,
          executionId: 'e1',
          action: RESPONSE_ACTIONS.loadForm,
          samlIdpResponseUrl: samlUrl,
          samlIdpResponseSamlResponse: 'saml-response-dummy-value',
          samlIdpResponseRelayState: 'saml-relay-state-dummy-value',
        }),
      );

      const mockSubmitForm = jest.spyOn(helpers, 'submitForm');
      mockSubmitForm.mockImplementation(() => {});

      document.body.innerHTML = `<h1>Custom element test</h1><descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

      const form = (await waitFor(
        () => {
          const samlForm = document.querySelector(`form[action="${samlUrl}"]`);

          if (!samlForm) {
            throw Error();
          }
          return samlForm;
        },
        {
          timeout: 8000,
        },
      )) as HTMLFormElement;

      expect(form).toBeInTheDocument();

      // validate inputs exist
      const inputSamlResponse = document.querySelector(
        `form[action="${samlUrl}"] input[role="saml-response"]`,
      );
      expect(inputSamlResponse).toBeInTheDocument();
      expect(inputSamlResponse).not.toBeVisible();
      expect(inputSamlResponse).toHaveValue('saml-response-dummy-value');

      // validate inputs are hidden
      const inputSamlRelayState = document.querySelector(
        `form[action="${samlUrl}"] input[role="saml-relay-state"]`,
      );
      expect(inputSamlRelayState).toBeInTheDocument();
      expect(inputSamlRelayState).not.toBeVisible();
      expect(inputSamlRelayState).toHaveValue('saml-relay-state-dummy-value');

      await waitFor(
        () => {
          expect(mockSubmitForm).toHaveBeenCalledTimes(1);
        },
        { timeout: 6000 },
      );
    });

    it('should automatic fill saml idp username in form element', async () => {
      startMock.mockReturnValue(
        generateSdkResponse({
          ok: true,
          executionId: 'e1',
        }),
      );
      nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

      const samlIdpEmailAddress = 'dummy@email.com';
      const encodedSamlIdpEmailAddress =
        encodeURIComponent(samlIdpEmailAddress);
      window.location.search = `?${SAML_IDP_USERNAME_PARAM_NAME}=${encodedSamlIdpEmailAddress}`;

      pageContent = `<div>Loaded</div><input class="descope-input" id="loginId" name="loginId" value="{{loginId}}">{{loginId}}</input><input class="descope-input" id="email" name="email">{{email}}</input>`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="versioned-flow" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('Loaded'), {
        timeout: WAIT_TIMEOUT,
      });

      const inputs = await waitFor(
        () => screen.findAllByShadowDisplayValue(samlIdpEmailAddress),
        {
          timeout: 6000,
        },
      );

      expect(inputs.length).toBe(2);
    });
  });

  describe('Descope UI', () => {
    beforeEach(() => {
      BaseDescopeWc.descopeUI = undefined;
    });
    it('should log error if Descope UI cannot be loaded', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      pageContent = '<input id="email"></input><span>It works!</span>';

      globalThis.DescopeUI = undefined;

      const errorSpy = jest.spyOn(console, 'error');

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(
        () =>
          expect(document.getElementById('load-descope-ui')).toHaveAttribute(
            'src',
            expect.stringContaining('https'),
          ),
        { timeout: WAIT_TIMEOUT },
      );

      document
        .getElementById('load-descope-ui')
        .dispatchEvent(new Event('error'));

      await waitFor(
        () =>
          expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Cannot load DescopeUI'),
          ),
        { timeout: WAIT_TIMEOUT },
      );
    });
    it('should try to load all descope component on the page', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      globalThis.DescopeUI = {
        'descope-button16': jest.fn(),
        'descope-input16': jest.fn(),
      };

      pageContent =
        '<descope-input16 id="email"></descope-input16><descope-button16>It works!</descope-button16>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(
        () =>
          Object.keys(globalThis.DescopeUI).forEach((key) =>
            expect(globalThis.DescopeUI[key]).toHaveBeenCalled(),
          ),
        { timeout: WAIT_TIMEOUT },
      );
    });
    it('should log an error if descope component is missing', async () => {
      startMock.mockReturnValue(generateSdkResponse());

      pageContent =
        '<descope-button1 id="email"></descope-button1><span>It works!</span>';

      const errorSpy = jest.spyOn(console, 'error');

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(
        () =>
          expect(errorSpy).toHaveBeenCalledWith(
            'Cannot load UI component "descope-button1"',
            expect.any(String),
          ),
        { timeout: WAIT_TIMEOUT },
      );
    });

    it('should call the ready cb when page is loaded', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

      pageContent =
        '<span>First Page</span><descope-button>click</descope-button>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      const ready = jest.fn();

      const wcEle = document.getElementsByTagName('descope-wc')[0];

      wcEle.addEventListener('ready', ready);

      await waitFor(() => screen.getByShadowText('First Page'), {
        timeout: WAIT_TIMEOUT,
      });

      // Should called after the page is loaded
      expect(ready).toBeCalledTimes(1);

      pageContent = '<span>Second Page</span>';

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(() => screen.getByShadowText('Second Page'), {
        timeout: WAIT_TIMEOUT,
      });

      // Should NOT be called again after the second page is updated
      expect(ready).toBeCalledTimes(1);

      wcEle.removeEventListener('ready', ready);
    });
  });

  it(
    'There are no multiple calls to submit',
    async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

      pageContent =
        '<descope-button id="submitterId">click</descope-button><input id="email" name="email"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));
      fireEvent.keyDown(screen.getByShadowText('click'), {
        key: 'Enter',
        code: 'Enter',
        charCode: 13,
      });

      await waitFor(() => expect(nextMock).toHaveBeenCalledTimes(1));
    },
    WAIT_TIMEOUT,
  );

  it('should call report validity on blur when validate-on-blur is set to true', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input name="email" id="email" placeholder="email"></input>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail" validate-on-blur="true"></descope-wc>`;

    const emailInput = await waitFor(
      () => screen.getByShadowPlaceholderText('email'),
      {
        timeout: WAIT_TIMEOUT,
      },
    );

    (<HTMLInputElement>emailInput).reportValidity = jest.fn();

    fireEvent.blur(emailInput);

    await waitFor(() =>
      expect(
        (<HTMLInputElement>emailInput).reportValidity,
      ).toHaveBeenCalledTimes(1),
    );
  });

  it('should not call report validity on blur by default', async () => {
    startMock.mockReturnValue(generateSdkResponse());

    pageContent = '<input name="email" id="email" placeholder="email"></input>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc project-id="1" flow-id="otpSignInEmail"></descope-wc>`;

    const emailInput = await waitFor(
      () => screen.getByShadowPlaceholderText('email'),
      {
        timeout: WAIT_TIMEOUT,
      },
    );

    (<HTMLInputElement>emailInput).reportValidity = jest.fn();

    fireEvent.blur(emailInput);

    await waitFor(() =>
      expect(
        (<HTMLInputElement>emailInput).reportValidity,
      ).not.toHaveBeenCalled(),
    );
  });

  it('Multiple buttons with auto-submit true, correct button is being called upon enter', async () => {
    startMock.mockReturnValueOnce(generateSdkResponse());
    nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

    pageContent =
      '<descope-button id="submitterId" auto-submit="true" data-type="button">click</descope-button><descope-button id="submitterId2" data-type="button">click2</descope-button><input id="email" name="email"></input><span>It works!</span>';

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('It works!'), {
      timeout: WAIT_TIMEOUT,
    });

    const rootEle = document
      .getElementsByTagName('descope-wc')[0]
      .shadowRoot.querySelector('#root');

    fireEvent.keyDown(rootEle, { key: 'Enter', code: 13, charCode: 13 });

    await waitFor(() =>
      expect(nextMock).toHaveBeenCalledWith(
        '0',
        '0',
        'submitterId',
        1,
        '1.2.3',
        {
          email: '',
          origin: 'http://localhost',
        },
      ),
    );
  });

  describe('password managers', () => {
    it('should store password in password manager', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      nextMock.mockReturnValueOnce(generateSdkResponse({ screenId: '1' }));

      Object.assign(navigator, { credentials: { store: jest.fn() } });
      globalThis.PasswordCredential = class {
        constructor(obj) {
          Object.assign(this, obj);
        }
      };
      pageContent =
        '<descope-button id="submitterId">click</descope-button><input id="email" name="email" value="1@1.com"></input><input id="password" name="password" value="pass"></input><span>It works!</span>';

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('It works!'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(
        () =>
          expect(navigator.credentials.store).toHaveBeenCalledWith({
            id: '1@1.com',
            password: 'pass',
          }),
        { timeout: WAIT_TIMEOUT },
      );
    });
  });

  describe('componentsConfig', () => {
    it('should parse componentsConfig values to screen components', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());
      nextMock.mockReturnValue(
        generateSdkResponse({
          screenState: {
            componentsConfig: { customComponent: { value: 'val1' } },
          },
        }),
      );

      pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="customComponent">`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('Loaded'), {
        timeout: WAIT_TIMEOUT,
      });

      fireEvent.click(screen.getByShadowText('click'));

      await waitFor(() => screen.getByShadowDisplayValue('val1'), {
        timeout: WAIT_TIMEOUT,
      });
    });
  });

  describe('Input Flows', () => {
    it('should pre-populate input with flat structure config structure', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="kuku"/>`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc form='{"kuku":"123"}' flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('Loaded'), {
        timeout: WAIT_TIMEOUT,
      });

      await waitFor(() => screen.getByShadowDisplayValue('123'), {
        timeout: WAIT_TIMEOUT,
      });
    });

    it('should pre-populate input with nested config structure', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="kuku"/>`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc form='{"kuku":{"value":"456"}}' flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('Loaded'), {
        timeout: WAIT_TIMEOUT,
      });

      await waitFor(() => screen.getByShadowDisplayValue('456'), {
        timeout: WAIT_TIMEOUT,
      });
    });

    it('should disable pre-populated input', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="kuku"/>`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc form='{"kuku":{"value":"123", "disabled":"true"}}' flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('Loaded'), {
        timeout: WAIT_TIMEOUT,
      });

      await waitFor(
        () =>
          expect(screen.getByShadowDisplayValue('123')).toHaveAttribute(
            'disabled',
            'true',
          ),
        {
          timeout: WAIT_TIMEOUT,
        },
      );
    });

    it('should pre-populate and disable input with combined nested/flat config structure', async () => {
      startMock.mockReturnValueOnce(generateSdkResponse());

      pageContent = `<descope-button>click</descope-button><div>Loaded</div><input class="descope-input" name="kuku"/><input class="descope-input" name="email"/>`;

      document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc form='{"kuku":{"value":"456", "disabled":"true"}, "email": "my@email.com"}' flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

      await waitFor(() => screen.getByShadowText('Loaded'), {
        timeout: WAIT_TIMEOUT,
      });

      await waitFor(() => screen.getByShadowDisplayValue('456'), {
        timeout: WAIT_TIMEOUT,
      });

      await waitFor(
        () =>
          expect(screen.getByShadowDisplayValue('456')).toHaveAttribute(
            'disabled',
            'true',
          ),
        {
          timeout: WAIT_TIMEOUT,
        },
      );
    });
  });

  it('should update page href attribute according to screen state', async () => {
    startMock.mockReturnValue(
      generateSdkResponse({ screenState: { user: { name: 'john' } } }),
    );

    pageContent = `<div>Loaded123</div><descope-link class="descope-link" href="{{user.name}}">ho!</descope-link>`;

    document.body.innerHTML = `<h1>Custom element test</h1> <descope-wc flow-id="otpSignInEmail" project-id="1"></descope-wc>`;

    await waitFor(() => screen.getByShadowText('Loaded123'), {
      timeout: WAIT_TIMEOUT,
    });
    await waitFor(() =>
      expect(screen.getByShadowText('ho!')).toHaveAttribute('href', 'john'),
    );
  });
});
