import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CountdownTimer from './CountdownTimer';

interface RenderResult {
  rerender: (ui: React.ReactElement) => void;
}

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders hours/minutes/seconds remaining', () => {
    render(<CountdownTimer endTime="2026-01-01T01:02:03Z" />);
    expect(screen.getByText('01:02:03')).toBeInTheDocument();
  });

  it('ticks down every second', () => {
    render(<CountdownTimer endTime="2026-01-01T00:00:05Z" />);
    expect(screen.getByText('00:00:05')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('00:00:04')).toBeInTheDocument();
  });

  it('shows Bitdi and calls onEnd once the time is up', () => {
    const onEnd = vi.fn();
    render(<CountdownTimer endTime="2026-01-01T00:00:01Z" onEnd={onEnd} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Bitdi')).toBeInTheDocument();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('does not call a new onEnd reference after expiry (re-render scenario)', () => {
    const onEnd1 = vi.fn();
    const result = render(<CountdownTimer endTime="2026-01-01T00:00:01Z" onEnd={onEnd1} />) as unknown as RenderResult;

    // Advance past expiry
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onEnd1).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Bitdi')).toBeInTheDocument();

    // Re-render with a new onEnd reference (but same endTime)
    const onEnd2 = vi.fn();
    result.rerender(<CountdownTimer endTime="2026-01-01T00:00:01Z" onEnd={onEnd2} />);

    // Advance time further
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The new onEnd should NOT have been called
    expect(onEnd2).toHaveBeenCalledTimes(0);
    // And "Bitdi" should still be displayed
    expect(screen.getByText('Bitdi')).toBeInTheDocument();
  });
});
