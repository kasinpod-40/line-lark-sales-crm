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
    let membershipCount = 0;
    let orderedCount = 0;
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
        if (!desiredIds.includes(primaryId)) {
          throw new Error(`Visible-field contract must keep the primary field visible: ${tableContract.name}.${viewContract.name}`);
        }

        if (typeof view.getVisibleFieldIdList !== 'function' || typeof view.hideField !== 'function' || typeof view.showField !== 'function') {
          unsupportedCount += 1;
          results.push({
            table: tableContract.name,
            view: viewContract.name,
            ok: false,
            membership_exact: false,
            order_exact: false,
            status: 'SDK_VISIBILITY_METHOD_UNAVAILABLE',
            type: viewContract.type,
          });
          continue;
        }

        const beforeIds = await view.getVisibleFieldIdList();
        const beforeNames = beforeIds.map((id) => nameById.get(id) || id);
        let changed = false;

        if (execute && !sameMembership(beforeIds, desiredIds)) {
          // The documented Base JS SDK can control visibility membership with
          // showField/hideField, but it does not expose a field-order setter.
          // Reconcile only missing/excess membership so an order-only drift never
          // causes repeated hide/show churn on an already-correct View.
          const desiredSet = new Set(desiredIds);
          const beforeSet = new Set(beforeIds);
          const hideIds = beforeIds.filter((id) => id !== primaryId && !desiredSet.has(id));
          const showIds = desiredIds.filter((id) => id !== primaryId && !beforeSet.has(id));

          if (hideIds.length > 0) {
            const hidden = await view.hideField(hideIds);
            if (hidden === false) throw new Error(`hideField rejected: ${tableContract.name}.${viewContract.name}`);
            changed = true;
          }
          if (showIds.length > 0) {
            const shown = await view.showField(showIds);
            if (shown === false) throw new Error(`showField rejected: ${tableContract.name}.${viewContract.name}`);
            changed = true;
          }
          if (changed) mutationCount += 1;
        }

        const afterIds = await view.getVisibleFieldIdList();
        const afterNames = afterIds.map((id) => nameById.get(id) || id);
        const membershipExact = sameMembership(afterIds, desiredIds);
        const orderExact = membershipExact && sameArray(afterIds, desiredIds);
        if (membershipExact) membershipCount += 1;
        if (orderExact) orderedCount += 1;

        results.push({
          table: tableContract.name,
          view: viewContract.name,
          ok: membershipExact,
          membership_exact: membershipExact,
          order_exact: orderExact,
          status: !membershipExact
            ? 'VISIBLE_FIELDS_MEMBERSHIP_MISMATCH'
            : (orderExact ? 'VISIBLE_FIELDS_MEMBERSHIP_AND_ORDER_PASS' : 'VISIBLE_FIELDS_MEMBERSHIP_PASS_ORDER_UI_REQUIRED'),
          changed,
          before: beforeNames,
          expected: desiredNames,
          after: afterNames,
        });
      }
    }

    const failures = results.filter((item) => !item.ok);
    const orderMismatches = results
      .filter((item) => item.ok && item.order_exact === false)
      .map((item) => ({
        table: item.table,
        view: item.view,
        status: 'ORDER_UI_REQUIRED',
        current: item.after,
        expected: item.expected,
      }));

    const summary = {
      ok: failures.length === 0,
      stage: 'lark_base_visible_fields_ui',
      mode: execute ? 'base-js-sdk-write-and-readback' : 'base-js-sdk-read-only',
      expected_views: results.length,
      membership_views: membershipCount,
      ordered_views: orderedCount,
      order_manual_views: orderMismatches.length,
      mutation_views: mutationCount,
      unsupported_views: unsupportedCount,
      failures,
      order_mismatches: orderMismatches,
      field_order: {
        status: orderMismatches.length === 0 ? 'ORDER_EXACT_PASS' : 'MANUAL_UI_PASS_REQUIRED',
        reason: 'Current documented Base JS SDK exposes ordered readback plus showField/hideField visibility controls, but no field-order mutation setter. Membership is automated; remaining order-only drift must not be retried as a failed visibility mutation.',
      },
      results,
      table_mutation_count: 0,
      field_schema_mutation_count: 0,
      record_mutation_count: 0,
    };
    print(summary);
    if (summary.ok && orderMismatches.length > 0) {
      setStatus(`Visible fields ครบ ${membershipCount} View; เหลือจัดลำดับคอลัมน์ใน UI ${orderMismatches.length} View`);
    } else {
      setStatus(summary.ok ? 'Visible fields และลำดับผ่านครบแล้ว' : `ยังมี ${failures.length} View ที่ membership ไม่ตรง`);
    }
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

function sameMembership(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length || leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((value) => rightSet.has(value));
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
