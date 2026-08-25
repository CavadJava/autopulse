import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ModelTabs from './ModelTabs';

describe('ModelTabs', () => {
  it('renders all five model tabs', () => {
    render(<ModelTabs activeModel="model3" onModelChange={vi.fn()} />);

    expect(screen.getByText('MODEL 3')).toBeInTheDocument();
    expect(screen.getByText('MODEL Y')).toBeInTheDocument();
    expect(screen.getByText('MODEL S')).toBeInTheDocument();
    expect(screen.getByText('MODEL X')).toBeInTheDocument();
    expect(screen.getByText('CYBER TRUCK')).toBeInTheDocument();
  });

  it('marks the active model tab', () => {
    render(<ModelTabs activeModel="modely" onModelChange={vi.fn()} />);

    const activeTab = screen.getByText('MODEL Y');
    expect(activeTab.className).toMatch(/active/);
  });

  it('calls onModelChange with the model key when a tab is clicked', () => {
    const handleChange = vi.fn();
    render(<ModelTabs activeModel="model3" onModelChange={handleChange} />);

    fireEvent.click(screen.getByText('CYBER TRUCK'));

    expect(handleChange).toHaveBeenCalledWith('cybertruck');
  });
});
