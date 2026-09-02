import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the AutoPulse Auksion heading on the home route', () => {
    render(<App />);
    expect(screen.getByText('AutoPulse Auksion')).toBeInTheDocument();
  });
});
