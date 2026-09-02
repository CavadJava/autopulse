import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CountdownTimer from './CountdownTimer';

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
});
