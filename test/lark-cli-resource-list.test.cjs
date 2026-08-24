const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const helperUrl = pathToFileURL(path.resolve(__dirname, '../scripts/lark-cli-resource-list.mjs')).href;

async function loadHelpers() {
  return import(helperUrl);
}

test('field list parser reads only the official fields collection and ignores nested select options', async () => {
  const { resourceMapFromList } = await loadHelpers();
  const payload = {
    ok: true,
    fields: [
      {
        id: 'fld_lead_quality',
        name: 'lead_quality',
        type: 'select',
        property: {
          options: [
            { id: 'opt_hot', name: '🔥 Hot Lead' },
            { id: 'opt_warm', name: '🟡 Warm Lead' }
          ]
        }
      },
      { id: 'fld_hot_lead', name: 'hot_lead', type: 'checkbox' }
    ],
    total: 2
  };

  const fields = resourceMapFromList(payload, {
    collectionKeys: ['fields'],
    nameKeys: ['name', 'field_name'],
    idKeys: ['id', 'field_id'],
    label: 'field'
  });

  assert.deepEqual([...fields.keys()], ['lead_quality', 'hot_lead']);
  assert.equal(fields.get('lead_quality').id, 'fld_lead_quality');
  assert.equal(fields.has('🔥 Hot Lead'), false);
  assert.equal(fields.has('🟡 Warm Lead'), false);
});

test('resource list parser selects the nearest official collection instead of nested resources', async () => {
  const { resourceMapFromList } = await loadHelpers();
  const payload = {
    ok: true,
    data: {
      items: [
        {
          dashboard_id: 'dash_exec',
          name: '🚀 Executive CRM Command Center',
          metadata: { items: [{ id: 'nested_fake', name: 'nested fake resource' }] }
        }
      ]
    }
  };

  const dashboards = resourceMapFromList(payload, {
    collectionKeys: ['items', 'dashboards'],
    nameKeys: ['name', 'dashboard_name'],
    idKeys: ['dashboard_id', 'id'],
    label: 'dashboard'
  });

  assert.deepEqual([...dashboards.keys()], ['🚀 Executive CRM Command Center']);
  assert.equal(dashboards.get('🚀 Executive CRM Command Center').id, 'dash_exec');
  assert.equal(dashboards.has('nested fake resource'), false);
});
