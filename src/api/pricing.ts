import { Plan, CheckoutPayload } from '../types';
import { mockPlans } from './mockData/pricing';

export async function getPricingPlans(): Promise<Plan[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockPlans;
}

export async function submitCheckout(payload: CheckoutPayload): Promise<{ success: true }> {
  // Simulate payment processing delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // In real scenario, send to actual payment gateway
  // For now, just return success
  console.log('Mock checkout submitted:', payload);
  return { success: true };
}
