/**
 * Proposal Generator
 * 
 * Creates professional PDF proposals from lead/client data
 * Uses package recommendations and pricing logic
 */

const { PACKAGES } = require('./package-recommender');

/**
 * Generate proposal content from lead data
 * Returns structured proposal object ready for PDF rendering
 */
function generateProposal(lead, options = {}) {
  const {
    includePricing = true,
    includeTimeline = true,
    includeTerms = true,
    validDays = 30
  } = options;
  
  // Determine package (use recommendation or override)
  const packageKey = options.package || lead.package_recommended || 'growth';
  const pkg = PACKAGES[packageKey];
  
  // Calculate pricing
  const pricing = calculatePricing(lead, pkg, options);
  
  // Build proposal structure
  const proposal = {
    // Metadata
    meta: {
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString(),
      proposalNumber: `PROP-${Date.now().toString(36).toUpperCase()}`,
      leadId: lead.id
    },
    
    // Client info
    client: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company
    },
    
    // Executive summary
    summary: {
      title: `${pkg.name} Package Proposal`,
      subtitle: lead.company ? `for ${lead.company}` : '',
      intro: generateIntro(lead, pkg),
      objective: lead.dream_outcome || generateObjective(lead)
    },
    
    // Scope of work
    scope: {
      package: pkg.name,
      services: extractServices(lead.services_interested),
      deliverables: pkg.deliverables,
      outOfScope: generateOutOfScope(pkg)
    },
    
    // Timeline
    timeline: includeTimeline ? {
      estimated: pkg.timeline,
      phases: generatePhases(pkg, lead)
    } : null,
    
    // Pricing
    pricing: includePricing ? pricing : null,
    
    // Terms & conditions
    terms: includeTerms ? generateTerms() : null,
    
    // Next steps
    nextSteps: [
      'Review this proposal',
      'Schedule a call to discuss details',
      'Sign agreement and submit deposit',
      'Kickoff meeting scheduled',
      'Project begins!'
    ]
  };
  
  return proposal;
}

function calculatePricing(lead, pkg, options) {
  let basePrice = pkg.basePrice;
  let addons = [];
  let discount = 0;
  
  // Add-ons based on requested services not in package
  const services = extractServices(lead.services_interested);
  const pkgServices = pkg.services.map(s => s.toLowerCase());
  
  services.forEach(service => {
    if (!pkgServices.includes(service.toLowerCase())) {
      const addon = getAddonPricing(service);
      if (addon) {
        addons.push(addon);
        basePrice += addon.price;
      }
    }
  });
  
  // Early-bird discount if specified
  if (options.earlyBird) {
    discount = Math.round(basePrice * 0.1); // 10% off
  }
  
  const subtotal = basePrice;
  const total = subtotal - discount;
  const deposit = Math.round(total * 0.5); // 50% upfront
  const final = total - deposit;
  
  return {
    basePrice: pkg.basePrice,
    addons,
    subtotal,
    discount,
    total,
    deposit,
    final,
    paymentTerms: '50% upfront, 50% on completion'
  };
}

function extractServices(servicesString) {
  if (!servicesString) return [];
  if (Array.isArray(servicesString)) return servicesString;
  return servicesString.split(',').map(s => s.trim()).filter(Boolean);
}

function getAddonPricing(service) {
  const addons = {
    'video': { name: 'Video Production', price: 3000 },
    'photography': { name: 'Photography', price: 1500 },
    'copywriting': { name: 'Professional Copywriting', price: 1000 },
    'seo': { name: 'Advanced SEO', price: 2000 },
    'ecommerce': { name: 'E-commerce Integration', price: 2500 }
  };
  
  const key = service.toLowerCase();
  return addons[key] || null;
}

function generateIntro(lead, pkg) {
  const company = lead.company || 'your business';
  return `Thank you for considering Melloo Media for ${company}. We're excited about the opportunity to help you ${lead.dream_outcome || 'achieve your goals'}. Based on your project requirements, we recommend our ${pkg.name} package as the perfect fit.`;
}

function generateObjective(lead) {
  const building = lead.what_building || 'your project';
  return `Create a professional, impactful brand presence that helps ${building} stand out and connect with ${lead.audience || 'your target audience'}.`;
}

function generateOutOfScope(pkg) {
  const outOfScope = [];
  
  if (!pkg.services.includes('Video')) {
    outOfScope.push('Video production');
  }
  if (!pkg.services.includes('Marketing')) {
    outOfScope.push('Paid advertising campaigns');
  }
  
  outOfScope.push('Ongoing maintenance (available separately)');
  outOfScope.push('Third-party integrations not specified');
  
  return outOfScope;
}

function generatePhases(pkg, lead) {
  const phases = [
    { name: 'Discovery & Strategy', duration: '1 week', deliverables: ['Project kickoff', 'Brand discovery workshop', 'Strategy document'] },
    { name: 'Design & Development', duration: pkg.timeline, deliverables: ['Initial concepts', 'Revisions', 'Final deliverables'] },
    { name: 'Launch & Handoff', duration: '1 week', deliverables: ['Final review', 'Training', 'Launch support'] }
  ];
  
  return phases;
}

function generateTerms() {
  return [
    'Payment: 50% deposit required to begin, 50% due upon completion',
    'Timeline: Estimated timeline begins upon receipt of deposit and required materials',
    'Revisions: Included revisions as specified in package; additional revisions billed hourly',
    'Ownership: Client owns all final deliverables upon final payment',
    'Cancellation: Deposit is non-refundable; work completed to date will be billed',
    'Validity: This proposal is valid for 30 days from date of issue'
  ];
}

/**
 * Format proposal as markdown (for preview/email)
 */
function formatProposalMarkdown(proposal) {
  const p = proposal;
  let md = '';
  
  md += `# ${p.summary.title}\n`;
  if (p.summary.subtitle) md += `## ${p.summary.subtitle}\n`;
  md += `\n---\n\n`;
  
  md += `**Proposal Number:** ${p.meta.proposalNumber}  \n`;
  md += `**Date:** ${new Date(p.meta.generatedAt).toLocaleDateString()}  \n`;
  md += `**Valid Until:** ${new Date(p.meta.expiresAt).toLocaleDateString()}  \n\n`;
  
  md += `## Executive Summary\n\n${p.summary.intro}\n\n`;
  md += `**Objective:** ${p.summary.objective}\n\n`;
  
  md += `## Scope of Work\n\n`;
  md += `**Package:** ${p.scope.package}\n\n`;
  md += `**Deliverables:**\n`;
  p.scope.deliverables.forEach(d => md += `- ${d}\n`);
  md += `\n`;
  
  if (p.timeline) {
    md += `## Timeline\n\n`;
    md += `**Estimated Duration:** ${p.timeline.estimated}\n\n`;
    md += `**Phases:**\n`;
    p.timeline.phases.forEach(phase => {
      md += `### ${phase.name} (${phase.duration})\n`;
      phase.deliverables.forEach(d => md += `- ${d}\n`);
      md += `\n`;
    });
  }
  
  if (p.pricing) {
    md += `## Investment\n\n`;
    md += `| Item | Amount |\n`;
    md += `|------|--------|\n`;
    md += `| Base Package | $${p.pricing.basePrice.toLocaleString()} |\n`;
    p.pricing.addons.forEach(addon => {
      md += `| ${addon.name} | $${addon.price.toLocaleString()} |\n`;
    });
    if (p.pricing.discount > 0) {
      md += `| Early-Bird Discount | -$${p.pricing.discount.toLocaleString()} |\n`;
    }
    md += `| **Total** | **$${p.pricing.total.toLocaleString()}** |\n\n`;
    md += `**Payment Terms:** ${p.pricing.paymentTerms}\n`;
    md += `- Deposit (50%): $${p.pricing.deposit.toLocaleString()}\n`;
    md += `- Final (50%): $${p.pricing.final.toLocaleString()}\n\n`;
  }
  
  if (p.terms) {
    md += `## Terms & Conditions\n\n`;
    p.terms.forEach(term => md += `- ${term}\n`);
    md += `\n`;
  }
  
  md += `## Next Steps\n\n`;
  p.nextSteps.forEach((step, i) => md += `${i + 1}. ${step}\n`);
  
  md += `\n---\n\n`;
  md += `*This proposal was generated by Melloo Media. Questions? Email us at hello@melloo.media*\n`;
  
  return md;
}

module.exports = {
  generateProposal,
  formatProposalMarkdown,
  calculatePricing
};
