import { bitable } from '/sdk/index.mjs';

const applyButton = document.querySelector('#apply');
const inspectButton = document.querySelector('#inspect');
const output = document.querySelector('#output');
const status = document.querySelector('#status');

applyButton?.addEventListener('click', () => run(true));
inspectButton?.addEventListener('click', () => run(false));

async function run(execute) {
  setBusy(true);
  setStatus(execute ? 'กำลัง Apply visible fields…' : 'กำลัง Inspect…');
  try {
    const contract = await fetch('/contract.json', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`contract.json HTTP ${response.status}`);
      return response.json();
    });
    if (contract?.contract_version !== 'lark_base_golden_ux_v1') {
      throw new Error(`Unexpected UX contract: ${String(contract?.contract_version || 'none')}`);
    }

    const base = bitable.base;
    if (!await base.isEditable()) throw new Error('Current Base is not editable by this user');

    const tableMetas = await base.getTableMetaList();
    const tableByName = uniqueByName(tableMetas, 'Table');
    const results = [];
    let mutationCount = 0;
    let exactCount = 0;
    let unsupportedCount = 0;

    for (const tableContract of contract.tables || []) {
      const tableMeta = tableByName.get(tableContract.name);
      if (!tableMeta) throw new Error(`Missing Table: ${tableContract.name}`);
      const table = await base.getTableByName(tableContract.name);
      const fieldMetas = await table.getFieldMetaList();
      const fieldByName = uniqueByName(fieldMetas, `${tableContract.name} Field`);
      const nameById = new Map(fieldMetas.map((field) => [requireId(field, `${tableContract.name} field`), field.name]));
      const primaryMeta = fieldMetas.find((field) => field?.isPrimary === true);
      const primaryId = requireId(primaryMeta, `${tableContract.name} primary field`);
      const viewMetas = await table.getViewMetaList();
      const viewByName = uniqueByName(viewMetas, `${tableContract.name} View`);

      for (const viewContract of tableContract.views || []) {
        const viewMeta = viewByName.get(viewContract.name);
        if (!viewMeta) throw new Error(`Missing View: ${tableContract.name}.${viewContract.name}`);
        const view = await table.getViewById(requireId(viewMeta, `${tableContract.name}.${viewContract.name}`));
        const desiredNames = [...(viewContract.visible_fields || [])];
        if (desiredNames.length === 0) continue;
        const desiredIds = desiredNames.map((name) => {
          const field = fieldByName.get(name);
          if (!field) throw new Error(`Missing Field: ${tableContract.name}.${name}`);
          return requireId(field, `${tableContract.name}.${name}`);
        });

        if (typeof view.getVisibleFieldIdList !== 'function' || typeof view.hideField !== 'function' || typeof view.showField !== 'function') {
          unsupportedCount += 1;
          results.push({
            table: tableContract.name,
            view: viewContract.name,
            ok: false,
            status: 'SDK_VISIBILITY_METHOD_UNAVAILABLE',
            type: viewContract.type,
          });
          continue;
        }

        const beforeIds = await view.getVisibleFieldIdList();
        const beforeNames = beforeIds.map((id) => nameById.get(id) || id);
        let changed = false;

        if (execute && !sameArray(beforeIds, desiredIds)) {
          // The server visible_fields endpoint is unreliable on the live target. For the
          // personal golden Base we can safely rebuild View presentation without touching
          // schema/data: keep primary visible, hide every other currently-visible field,
          // then show the desired fields one-by-one in contract order.
          const hideIds = beforeIds.filter((id) => id !== primaryId);
          if (hideIds.length > 0) {
            const hidden = await view.hideField(hideIds);
            if (hidden === false) throw new Error(`hideField rejected: ${tableContract.name}.${viewContract.name}`);
            changed = true;
          }
          for (const fieldId of desiredIds) {
            if (fieldId === primaryId) continue;
            const shown = await view.showField(fieldId);
            if (shown === false) throw new Error(`showField rejected: ${tableContract.name}.${viewContract.name}.${nameById.get(fieldId) || fieldId}`);
            changed = true;
          }
          if (changed) mutationCount += 1;
        }

        const afterIds = await view.getVisibleFieldIdList();
        const afterNames = afterIds.map((id) => nameById.get(id) || id);
        const exact = sameArray(afterIds, desiredIds);
        if (exact) exactCount += 1;
        results.push({
          table: tableContract.name,
          view: viewContract.name,
          ok: exact,
          status: exact ? 'EXACT_VISIBLE_FIELDS_PASS' : 'VISIBLE_FIELDS_STILL_MISMATCH',
          changed,
          before: beforeNames,
          expected: desiredNames,
          after: afterNames,
        });
      }
    }

    const failures = results.filter((item) => !item.ok);
    const summary = {
      ok: failures.length === 0,
      stage: 'lark_base_visible_fields_ui',
      mode: execute ? 'base-js-sdk-write-and-readback' : 'base-js-sdk-read-only',
      expected_views: results.length,
      exact_views: exactCount,
      mutation_views: mutationCount,
      unsupported_views: unsupportedCount,
      failures,
      results,
      table_mutation_count: 0,
      field_schema_mutation_count: 0,
      record_mutation_count: 0,
    };
    print(summary);
    setStatus(summary.ok ? 'Visible fields ผ่านครบแล้ว' : `ยังมี ${failures.length} View ที่ไม่ตรง`);
  } catch (error) {
    print({ ok: false, stage: 'lark_base_visible_fields_ui', error: error instanceof Error ? error.message : String(error) });
    setStatus('หยุดแบบ fail-closed');
  } finally {
    setBusy(false);
  }
}

function uniqueByName(items, label) {
  if (!Array.isArray(items)) throw new Error(`${label} metadata is not an array`);
  const map = new Map();
  for (const item of items) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) throw new Error(`${label} missing name`);
    if (map.has(name)) throw new Error(`Duplicate ${label}: ${name}`);
    map.set(name, item);
  }
  return map;
}

function requireId(value, label) {
  const id = typeof value?.id === 'string'
    ? value.id.trim()
    : (typeof value?.fieldId === 'string' ? value.fieldId.trim() : '');
  if (!id) throw new Error(`${label} missing id`);
  return id;
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function setBusy(value) {
  if (applyButton) applyButton.disabled = value;
  if (inspectButton) inspectButton.disabled = value;
}

function setStatus(value) {
  if (status) status.textContent = value;
}

function print(value) {
  const text = JSON.stringify(value, null, 2);
  if (output) output.textContent = text;
  console.log(text);
}
