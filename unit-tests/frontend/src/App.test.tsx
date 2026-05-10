import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock(
  'react-router-dom',
  () => ({
    NavLink: ({ children }: { children: any }) => <>{children}</>,
  }),
  { virtual: true },
);

import Navbar from './components/Navbar';

test('renders app brand and navigation', () => {
  render(<Navbar />);
  expect(screen.getByText(/EraseGraph/i)).toBeInTheDocument();
  expect(screen.getByText(/Overview/i)).toBeInTheDocument();
  expect(screen.getByText(/Submit Request/i)).toBeInTheDocument();
});
