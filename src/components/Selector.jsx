import React, { useId } from 'react';

// Accessible native select, styled as a teletext field.
export default function Selector({ label, value, onChange, options, disabled }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
        {options.map((o) => (o.group ? (
          <optgroup key={o.group} label={o.group}>
            {o.options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </optgroup>
        ) : (
          <option key={o.value} value={o.value}>{o.label}</option>
        )))}
      </select>
    </label>
  );
}
