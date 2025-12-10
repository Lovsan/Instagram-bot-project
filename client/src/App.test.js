import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

test('shows bot control center', () => {
  global.fetch = jest.fn((url) => {
    if (typeof url === 'string' && url.indexOf('/api/bots') === 0) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: { items: [], total: 0, active: 0 }
          })
      });
    }
    if (typeof url === 'string' && url.indexOf('/api/proxies') === 0) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] })
      });
    }
    if (typeof url === 'string' && url.indexOf('/api/reports') === 0) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] })
      });
    }
    return Promise.resolve({
      json: () =>
        Promise.resolve({
          isLoggedIn: true,
          userdata: {}
        })
    });
  });

  const { getByText } = render(<App />);
  const heading = getByText(/bot control center/i);
  expect(heading).toBeInTheDocument();
});

afterEach(() => {
  if (global.fetch && global.fetch.mockClear) {
    global.fetch.mockClear();
  }
  delete global.fetch;
});
