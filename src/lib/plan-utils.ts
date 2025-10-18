import { db } from "@/db";

export interface PlanInfo {
  id: number;
  name: string;
  isPremium: boolean;
  numberOfFiles: number;
  numberOfEssayWriter: number;
  numberOfEssayGrader: number;
}

export async function getUserPlan(userId: string): Promise<PlanInfo | null> {
  try {
    const user = await (db as any).user.findUnique({
      where: { id: userId },
      include: {
        plans: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!user || !user.plans.length) {
      return null;
    }

    const plan = user.plans[0];
    return {
      id: plan.id,
      name: plan.name,
      isPremium: plan.name.toLowerCase().includes('pro') || plan.name.toLowerCase().includes('premium'),
      numberOfFiles: plan.numberOfFiles,
      numberOfEssayWriter: plan.numberOfEssayWriter,
      numberOfEssayGrader: plan.numberOfEssayGrader,
    };
  } catch (error) {
    console.error("Error fetching user plan:", error);
    return null;
  }
}

export function isPremiumPlan(planName: string): boolean {
  const name = planName.toLowerCase();
  return name.includes('pro') || name.includes('premium') || name.includes('unlimited');
}

export function getProPlanId(): number {
  // This should match the Pro plan ID from your admin panel
  // You can adjust this based on your actual Pro plan ID
  return 2; // Assuming Pro plan has ID 2, adjust as needed
}
