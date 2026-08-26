import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import Header from './Header';

describe('Header', () => {
  it('renders a link to the parts catalog', () => {
    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter>
            <Header />
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    const link = screen.getByRole('link', { name: /hissələr/i });
    expect(link).toHaveAttribute('href', '/hisseler');
  });
});
