const highRiskTerms = ["security", "production", "payment", "medical", "deploy"];
const complexTerms = ["debug", "analyze", "analyse", "architecture", "distributed", "compare"];

export function chooseStrategy(task, risk = "low") {
  const normalizedTask = task.trim().toLowerCase();
  const words = normalizedTask.split(/\s+/).filter(Boolean);
  const highRisk = risk === "high" || highRiskTerms.some((term) => normalizedTask.includes(term));
  const complexTask = words.length > 24 || complexTerms.some((term) => normalizedTask.includes(term));

  if (highRisk) {
    return {
      strategy: "careful_plan",
      verification: true,
      reason: "High-impact work gets a deliberate plan and an explicit verification step.",
      confidence: "rule-based",
    };
  }
  if (complexTask) {
    return {
      strategy: "structured_plan",
      verification: true,
      reason: "This task appears multi-step; the preview adds structure and verification.",
      confidence: "rule-based",
    };
  }
  if (words.length > 0 && words.length <= 5) {
    return {
      strategy: "direct_answer",
      verification: false,
      reason: "A short, low-risk task can start with the lightest strategy.",
      confidence: "rule-based",
    };
  }
  return {
    strategy: "standard_plan",
    verification: false,
    reason: "Use a standard plan until evaluation data supports a different choice.",
    confidence: "rule-based",
  };
}