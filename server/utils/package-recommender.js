/**
 * Package Recommendation Engine
 * 
 * Analyzes lead data and recommends appropriate service package
 * based on budget, services needed, timeline, and complexity.
 */

// Package definitions with base pricing and deliverables
const PACKAGES = {
  starter: {
    name: 'Starter',
    price: '$2,500 - $5,000',
    basePrice: 3500,
    ideal_for: 'Small businesses and startups getting started',
    deliverables: [
      'Basic brand identity (logo + color palette)',
      '5-page website (responsive)',
      'Basic SEO setup',
      '2 rounds of revisions'
    ],
    timeline: '2-4 weeks',
    services: ['Branding', 'Website'],
    max_complexity: 'low'
  },
  growth: {
    name: 'Growth',
    price: '$5,000 - $15,000',
    basePrice: 10000,
    ideal_for: 'Growing businesses ready to scale',
    deliverables: [
      'Complete brand identity system',
      '10-15 page website with CMS',
      'Content strategy + 5 blog posts',
      'Social media templates',
      'Advanced SEO + analytics',
      'Email marketing setup',
      '3 rounds of revisions'
    ],
    timeline: '4-8 weeks',
    services: ['Branding', 'Website', 'Content', 'Marketing'],
    max_complexity: 'medium'
  },
  premium: {
    name: 'Premium',
    price: '$15,000+',
    basePrice: 25000,
    ideal_for: 'Established businesses and ambitious launches',
    deliverables: [
      'Full brand strategy + positioning',
      'Custom website with advanced features',
      'Video production (2-3 videos)',
      'Complete content library (10+ pieces)',
      'Multi-channel marketing campaign',
      'Ongoing support (3 months)',
      'Unlimited revisions'
    ],
    timeline: '8-12 weeks',
    services: ['Branding', 'Website', 'Content', 'Video', 'Marketing'],
    max_complexity: 'high'
  }
};

/**
 * Score a package fit for the given lead
 * Returns score 0-100
 */
function scorePackageFit(lead, packageKey) {
  const pkg = PACKAGES[packageKey];
  let score = 0;
  
  // Budget alignment (40 points max)
  const budgetScore = scoreBudgetFit(lead.budget_range, pkg);
  score += budgetScore;
  
  // Service needs alignment (30 points max)
  const serviceScore = scoreServiceFit(lead.services_interested, pkg.services);
  score += serviceScore;
  
  // Timeline alignment (20 points max)
  const timelineScore = scoreTimelineFit(lead.timeline, pkg.timeline);
  score += timelineScore;
  
  // Complexity alignment (10 points max)
  const complexityScore = scoreComplexityFit(lead, pkg.max_complexity);
  score += complexityScore;
  
  return Math.min(100, Math.round(score));
}

function scoreBudgetFit(leadBudget, pkg) {
  if (!leadBudget) return 20; // neutral if not specified
  
  const budgetMap = {
    '$2,500-$5,000': { min: 2500, max: 5000 },
    '$5,000-$10,000': { min: 5000, max: 10000 },
    '$10,000-$25,000': { min: 10000, max: 25000 },
    '$25,000+': { min: 25000, max: 100000 }
  };
  
  const range = budgetMap[leadBudget];
  if (!range) return 20;
  
  // Perfect match if package base price falls within budget
  if (pkg.basePrice >= range.min && pkg.basePrice <= range.max) return 40;
  
  // Close match if within 50%
  const midpoint = (range.min + range.max) / 2;
  const diff = Math.abs(pkg.basePrice - midpoint);
  const maxDiff = range.max - range.min;
  
  if (diff < maxDiff * 0.5) return 30;
  if (diff < maxDiff * 1.0) return 20;
  
  return 10; // far from budget
}

function scoreServiceFit(leadServices, pkgServices) {
  if (!leadServices || leadServices.length === 0) return 15; // neutral
  
  // Parse services from comma-separated string if needed
  const services = Array.isArray(leadServices) 
    ? leadServices 
    : leadServices.split(',').map(s => s.trim());
  
  // Count how many requested services are in package
  const matches = services.filter(s => 
    pkgServices.some(ps => ps.toLowerCase().includes(s.toLowerCase()))
  );
  
  const matchRatio = matches.length / services.length;
  
  if (matchRatio >= 0.8) return 30; // 80%+ match
  if (matchRatio >= 0.6) return 25; // 60%+ match
  if (matchRatio >= 0.4) return 20; // 40%+ match
  
  return 15; // low match
}

function scoreTimelineFit(leadTimeline, pkgTimeline) {
  if (!leadTimeline) return 10; // neutral
  
  const timelineUrgency = {
    'ASAP': 1,
    '1-2 months': 2,
    '3-6 months': 3,
    '6+ months': 4
  };
  
  const pkgTimelineMap = {
    '2-4 weeks': 1,
    '4-8 weeks': 2,
    '8-12 weeks': 3
  };
  
  const leadUrgency = timelineUrgency[leadTimeline] || 2;
  const pkgDuration = pkgTimelineMap[pkgTimeline] || 2;
  
  // Perfect if package can deliver within timeline
  if (pkgDuration <= leadUrgency) return 20;
  
  // Close if within 1 tier
  if (Math.abs(pkgDuration - leadUrgency) === 1) return 15;
  
  return 10; // mismatch
}

function scoreComplexityFit(lead, maxComplexity) {
  // Estimate project complexity from description
  const dreamLength = (lead.dream_outcome || '').length;
  const whatLength = (lead.what_building || '').length;
  const hasReferences = lead.references && lead.references.length > 0;
  
  let complexity = 'low';
  
  if (dreamLength > 200 || whatLength > 300 || hasReferences) {
    complexity = 'high';
  } else if (dreamLength > 100 || whatLength > 150) {
    complexity = 'medium';
  }
  
  const complexityMap = { low: 1, medium: 2, high: 3 };
  const leadLevel = complexityMap[complexity];
  const pkgLevel = complexityMap[maxComplexity];
  
  // Package should handle the complexity
  if (pkgLevel >= leadLevel) return 10;
  
  return 5; // package may be too simple
}

/**
 * Recommend the best package for a lead
 * Returns package key and score
 */
function recommendPackage(lead) {
  const scores = {
    starter: scorePackageFit(lead, 'starter'),
    growth: scorePackageFit(lead, 'growth'),
    premium: scorePackageFit(lead, 'premium')
  };
  
  // Find highest scoring package
  const recommended = Object.entries(scores).reduce((best, [key, score]) => {
    return score > best.score ? { key, score } : best;
  }, { key: 'growth', score: 0 });
  
  return {
    package: recommended.key,
    package_name: PACKAGES[recommended.key].name,
    confidence: recommended.score,
    details: PACKAGES[recommended.key],
    alternatives: Object.keys(PACKAGES)
      .filter(k => k !== recommended.key)
      .map(k => ({
        package: k,
        name: PACKAGES[k].name,
        score: scores[k]
      }))
      .sort((a, b) => b.score - a.score)
  };
}

module.exports = {
  PACKAGES,
  recommendPackage,
  scorePackageFit
};
