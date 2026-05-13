/**
 * Campaign Builder - Visual Flow Editor
 */

let nodes = [];
let edges = [];
let selectedNodeId = null;
let dragNodeId = null;
let isConnecting = false;
let connectSource = null;
let editingCampaignId = null;

// Node Types and Metadata
const NODE_TYPES = {
    trigger: { icon: '⚡', label: 'Trigger' },
    action: { icon: '🚀', label: 'Action' },
    wait: { icon: '⏳', label: 'Wait' },
    condition: { icon: '➔', label: 'Condition' },
    end: { icon: '🏁', label: 'End' }
};

/**
 * Initialize new campaign
 */
function createNewCampaign() {
    editingCampaignId = null;
    nodes = [];
    edges = [];
    document.getElementById('builder-title').textContent = 'New Campaign';
    document.getElementById('builder-modal').style.display = 'flex';
    clearCanvas();
}

/**
 * Load existing campaign into builder
 */
async function editCampaign(id) {
    try {
        const res = await fetch(`/api/campaigns/${id}`);
        const campaign = await res.json();
        
        editingCampaignId = id;
        document.getElementById('builder-title').textContent = campaign.name;
        
        const flow = campaign.flow_data || { nodes: [], edges: [] };
        nodes = flow.nodes || [];
        edges = flow.edges || [];
        
        document.getElementById('builder-modal').style.display = 'flex';
        renderFlow();
    } catch (e) {
        showToast('Failed to load campaign flow', 'error');
    }
}

function closeBuilder() {
    document.getElementById('builder-modal').style.display = 'none';
}

/**
 * Canvas Drag & Drop
 */
function onDragTool(ev, type, subType) {
    ev.dataTransfer.setData('nodeType', type);
    if (subType) ev.dataTransfer.setData('nodeSubType', subType);
}

function allowDrop(ev) {
    ev.preventDefault();
}

function onDropCanvas(ev) {
    ev.preventDefault();
    const type = ev.dataTransfer.getData('nodeType');
    const subType = ev.dataTransfer.getData('nodeSubType');
    
    if (!type) return;

    const rect = document.getElementById('builder-canvas').getBoundingClientRect();
    const x = ev.clientX - rect.left - 90; // Center node
    const y = ev.clientY - rect.top - 40;

    const newNode = {
        id: 'n_' + Date.now(),
        type: type,
        position: { x, y },
        data: {
            label: NODE_TYPES[type].label,
            actionType: subType || null,
            // Defaults
            ...(type === 'wait' ? { days: 1 } : {}),
            ...(type === 'action' && subType === 'email' ? { subject: '', body: '' } : {}),
            ...(type === 'trigger' ? { triggerType: 'client_onboarded' } : {})
        }
    };

    nodes.push(newNode);
    renderFlow();
}

/**
 * Rendering
 */
function renderFlow() {
    const canvas = document.getElementById('builder-canvas');
    const svg = document.getElementById('campaign-svg-canvas');
    
    // Clear nodes (except SVG)
    Array.from(canvas.children).forEach(child => {
        if (child.tagName !== 'svg') child.remove();
    });

    // Render Nodes
    nodes.forEach(node => {
        const div = document.createElement('div');
        div.className = `builder-node node-${node.type} ${selectedNodeId === node.id ? 'selected' : ''}`;
        div.style.left = node.position.x + 'px';
        div.style.top = node.position.y + 'px';
        div.id = node.id;
        
        const icon = NODE_TYPES[node.type].icon;
        const sub = node.data.actionType ? `(${node.data.actionType ? node.data.actionType.toUpperCase() : ""})` : '';
        
        div.innerHTML = `
            <div class="node-header">
                <span>${node.data.label}</span>
                <span class="node-icon">${icon}</span>
            </div>
            <div class="node-body">
                <div class="node-title">${node.data.label} ${sub}</div>
                <div class="node-sub">${getNodeSummary(node)}</div>
            </div>
            ${node.type !== 'trigger' ? '<div class="node-handle input" onmousedown="onStartConnect(event, \''+node.id+'\', \'input\')"></div>' : ''}
            ${node.type === 'condition' ? `
                <div class="node-handle output true" onmousedown="onStartConnect(event, '${node.id}', 'output', 'true')" title="True"></div>
                <div class="node-handle output false" onmousedown="onStartConnect(event, '${node.id}', 'output', 'false')" title="False"></div>
            ` : (node.type !== 'end' ? `<div class="node-handle output" onmousedown="onStartConnect(event, '${node.id}', 'output')"></div>` : '')}
        `;

        div.onmousedown = (e) => onNodeMouseDown(e, node.id);
        canvas.appendChild(div);
    });

    renderEdges();
}

function getNodeSummary(node) {
    if (node.type === 'wait') return `Wait ${node.data.days || 0}d ${node.data.hours || 0}h`;
    if (node.type === 'trigger') return (node.data.triggerType || "").replace('_', ' ');
    if (node.type === 'action') return node.data.actionType;
    return '';
}

function renderEdges() {
    const svg = document.getElementById('campaign-svg-canvas');
    // Clear paths
    Array.from(svg.querySelectorAll('.connector-line')).forEach(p => p.remove());

    edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'connector-line');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            
            const d = calculatePath(sourceNode, targetNode, edge);
            path.setAttribute('d', d);
            svg.appendChild(path);
        }
    });
}

function calculatePath(source, target, edge) {
    const x1 = source.position.x + 180; // Output handle
    let y1 = source.position.y + 40;
    
    // Adjust y1 for true/false handles
    if (edge && edge.sourceHandle === 'true') y1 -= 15;
    if (edge && edge.sourceHandle === 'false') y1 += 15;

    const x2 = target.position.x; // Input handle
    const y2 = target.position.y + 40;
    
    const cp1x = x1 + (x2 - x1) / 2;
    const cp2x = x1 + (x2 - x1) / 2;
    
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
}

/**
 * Node Interactions
 */
function onNodeMouseDown(ev, id) {
    if (ev.target.classList.contains('node-handle')) return;
    
    selectedNodeId = id;
    dragNodeId = id;
    
    nodes.forEach(n => {
        const el = document.getElementById(n.id);
        if (el) el.classList.toggle('selected', n.id === id);
    });

    showProperties(id);

    const startX = ev.clientX;
    const startY = ev.clientY;
    const node = nodes.find(n => n.id === id);
    const initialX = node.position.x;
    const initialY = node.position.y;

    const onMouseMove = (e) => {
        node.position.x = initialX + (e.clientX - startX);
        node.position.y = initialY + (e.clientY - startY);
        const el = document.getElementById(id);
        el.style.left = node.position.x + 'px';
        el.style.top = node.position.y + 'px';
        renderEdges();
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

/**
 * Handle Connectivity
 */
function onStartConnect(ev, nodeId, handleType, handleId) {
    ev.stopPropagation();
    if (handleType === 'input') return; // Can only start from output

    isConnecting = true;
    connectSource = nodeId;
    
    const svg = document.getElementById('campaign-svg-canvas');
    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('class', 'connector-line active');
    tempPath.setAttribute('id', 'temp-connector');
    svg.appendChild(tempPath);

    const onMouseMove = (e) => {
        const rect = document.getElementById('builder-canvas').getBoundingClientRect();
        const node = nodes.find(n => n.id === nodeId);
        const x1 = node.position.x + 180;
        let y1 = node.position.y + 40;

        if (handleId === 'true') y1 -= 15;
        if (handleId === 'false') y1 += 15;
        const x2 = e.clientX - rect.left;
        const y2 = e.clientY - rect.top;
        
        tempPath.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
    };

    const onMouseUp = (e) => {
        isConnecting = false;
        tempPath.remove();
        
        // Find if dropped on an input handle
        const target = e.target.closest('.builder-node');
        if (target && target.id !== nodeId) {
            // Add edge
            // Delete existing edges from this same output handle
            edges = edges.filter(ed => !(ed.source === nodeId && ed.sourceHandle === handleId));
            edges.push({
                id: 'e_' + Date.now(),
                source: nodeId,
                sourceHandle: handleId || 'output',
                target: target.id
            });
            renderEdges();
        }
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

/**
 * Properties Panel
 */
function showProperties(id) {
    const props = document.getElementById('builder-properties');
    const form = document.getElementById('node-config-form');
    const node = nodes.find(n => n.id === id);
    
    props.style.display = 'block';
    
    let html = `
        <div class="form-group">
            <label>Node Name</label>
            <input type="text" value="${node.data.label}" oninput="updateNodeData('${id}', 'label', this.value)">
        </div>
    `;

    if (node.type === 'trigger') {
        html += `
            <div class="form-group">
                <label>Trigger Event</label>
                <select onchange="updateNodeData('${id}', 'triggerType', this.value)">
                    <option value="client_onboarded" ${node.data.triggerType === 'client_onboarded' ? 'selected' : ''}>Client Onboarded</option>
                    <option value="invoice_sent" ${node.data.triggerType === 'invoice_sent' ? 'selected' : ''}>Invoice Sent</option>
                    <option value="invoice_overdue" ${node.data.triggerType === 'invoice_overdue' ? 'selected' : ''}>Invoice Overdue</option>
                    <option value="project_completed" ${node.data.triggerType === 'project_completed' ? 'selected' : ''}>Project Completed</option>
                </select>
            </div>
        `;
    } else if (node.type === 'wait') {
        html += `
            <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                    <label>Days</label>
                    <input type="number" value="${node.data.days || 0}" oninput="updateNodeData('${id}', 'days', this.value)">
                </div>
                <div>
                    <label>Hours</label>
                    <input type="number" value="${node.data.hours || 0}" oninput="updateNodeData('${id}', 'hours', this.value)">
                </div>
            </div>
        `;
    } else if (node.type === 'action') {
        if (node.data.actionType === 'email') {
            html += `
                <div class="form-group">
                    <label>Email Template</label>
                    <select id="prop-email-template" onchange="updateNodeData('${id}', 'templateId', this.value)">
                        <option value="">Manual Entry...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Subject</label>
                    <input type="text" value="${node.data.subject || ''}" oninput="updateNodeData('${id}', 'subject', this.value)">
                </div>
                <div class="form-group">
                    <label>Body Content</label>
                    <textarea rows="5" oninput="updateNodeData('${id}', 'body', this.value)">${node.data.body || ''}</textarea>
                </div>
            `;
            loadTemplateOptions('email', 'prop-email-template', node.data.templateId);
        } else if (node.data.actionType === 'task') {
            html += `
                <div class="form-group">
                    <label>Task Title</label>
                    <input type="text" value="${node.data.taskTitle || ''}" oninput="updateNodeData('${id}', 'taskTitle', this.value)">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea rows="3" oninput="updateNodeData('${id}', 'taskDescription', this.value)">${node.data.taskDescription || ''}</textarea>
                </div>
            `;
        }
    } else if (node.type === 'condition') {
        html += `
            <div class="form-group">
                <label>Check Condition</label>
                <select onchange="updateNodeData('${id}', 'conditionType', this.value)">
                    <option value="has_paid_invoice" ${node.data.conditionType === 'has_paid_invoice' ? 'selected' : ''}>Has Paid Invoice</option>
                    <option value="is_subscribed" ${node.data.conditionType === 'is_subscribed' ? 'selected' : ''}>Is Subscribed</option>
                    <option value="was_email_sent" ${node.data.conditionType === 'was_email_sent' ? 'selected' : ''}>Was Email Sent</option>
                </select>
            </div>
            <p style="font-size: 11px; color: rgba(255,255,255,0.4);">This node branches based on whether the condition is met at this moment.</p>
        `;
    }

    html += `<button onclick="deleteNode('${id}')" class="btn-danger" style="width:100%; margin-top:20px;">Delete Node</button>`;
    form.innerHTML = html;
}

function updateNodeData(id, field, value) {
    const node = nodes.find(n => n.id === id);
    if (node) {
        node.data[field] = value;
        // Optimization: update summary without full re-render
        const sub = document.getElementById(id)?.querySelector('.node-sub');
        if (sub) sub.textContent = getNodeSummary(node);
    }
}

async function loadTemplateOptions(type, selectId, currentVal) {
    try {
        const res = await fetch(`/api/campaigns/templates/${type}`);
        const templates = await res.json();
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Manual Entry...</option>' + 
                templates.map(t => `<option value="${t.id}" ${t.id == currentVal ? 'selected' : ''}>${t.name}</option>`).join('');
        }
    } catch (e) {}
}

function deleteNode(id) {
    nodes = nodes.filter(n => n.id !== id);
    edges = edges.filter(e => e.source !== id && e.target !== id);
    selectedNodeId = null;
    document.getElementById('builder-properties').style.display = 'none';
    renderFlow();
}

/**
 * Persistence
 */
async function saveCampaign() {
    const name = document.getElementById('builder-title').textContent;
    const triggerNode = nodes.find(n => n.type === 'trigger');
    const trigger = triggerNode ? triggerNode.data.triggerType : 'manual';
    
    const payload = {
        name,
        trigger,
        flow_data: { nodes, edges },
        status: 'active'
    };

    try {
        const url = editingCampaignId ? `/api/campaigns/${editingCampaignId}` : '/api/campaigns';
        const method = editingCampaignId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Campaign flow saved successfully');
            closeBuilder();
            loadCampaigns();
        }
    } catch (e) {
        showToast('Error saving campaign', 'error');
    }
}

function clearCanvas() {
    nodes = [];
    edges = [];
    selectedNodeId = null;
    document.getElementById('builder-properties').style.display = 'none';
    renderFlow();
}
