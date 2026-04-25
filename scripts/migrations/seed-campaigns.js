const db = require('../../server/database');

async function seedCampaigns() {
  console.log('Seeding campaign data...');

  // 1. Seed Email Templates
  const emailTemplates = [
    {
      name: 'Welcome Email',
      subject: 'Welcome to the Agency! {{client_name}}',
      body: '<p>Hi {{client_name}}!</p><p>We are thrilled to have you onboard. Your journey with {{company}} starts now.</p><p>Best,<br>The Team</p>',
      category: 'Onboarding'
    },
    {
      name: 'Invoice Reminder - Gentle',
      subject: 'Friendly Reminder: Invoice {{invoice_number}}',
      body: '<p>Hi {{client_name}},</p><p>Just a quick note that invoice {{invoice_number}} (${{amount}}) is due on {{due_date}}.</p><p>Thanks!</p>',
      category: 'Billing'
    },
    {
      name: 'Invoice Reminder - Firm',
      subject: 'URGENT: Overdue Invoice {{invoice_number}}',
      body: '<p>Hi {{client_name}},</p><p>Our records show that invoice {{invoice_number}} is now overdue. Please settle this as soon as possible.</p>',
      category: 'Billing'
    }
  ];

  for (const t of emailTemplates) {
    db.run('INSERT INTO email_templates (name, subject, body, category) VALUES (?, ?, ?, ?)', [t.name, t.subject, t.body, t.category]);
  }

  // 2. Seed SMS Templates
  const smsTemplates = [
    {
      name: 'Quick Payment Reminder',
      body: 'Hi {{client_name}}, your invoice {{invoice_number}} (${{amount}}) is due {{due_date}}. Pay here: {{link}}'
    },
    {
      name: 'Meeting Reminder',
      body: 'Hey {{client_name}}, reminder of our meeting tomorrow at {{time}}.'
    }
  ];

  for (const t of smsTemplates) {
    db.run('INSERT INTO sms_templates (name, body) VALUES (?, ?)', [t.name, t.body]);
  }

  // 3. Seed an Initial Campaign (Simplified Flow Data)
  const onboardingFlow = {
    nodes: [
      { id: 'n1', type: 'trigger', position: { x: 50, y: 50 }, data: { triggerType: 'client_onboarded', label: 'Client Onboarded' } },
      { id: 'n2', type: 'action', position: { x: 50, y: 150 }, data: { actionType: 'email', templateId: 1, label: 'Send Welcome Email' } },
      { id: 'n3', type: 'wait', position: { x: 50, y: 250 }, data: { days: 2, label: 'Wait 2 Days' } },
      { id: 'n4', type: 'action', position: { x: 50, y: 350 }, data: { actionType: 'task', taskTitle: 'Schedule Onboarding Call', label: 'Create Task' } },
      { id: 'n5', type: 'end', position: { x: 50, y: 450 }, data: { label: 'Campaign End' } }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' }
    ]
  };

  db.run('INSERT INTO campaigns (name, description, trigger, flow_data, status) VALUES (?, ?, ?, ?, ?)', 
    ['Client Onboarding Sequence', 'Welcome new clients and schedule their first call.', 'client_onboarded', JSON.stringify(onboardingFlow), 'active']);

  console.log('Campaign seeding complete.');
}

seedCampaigns();
