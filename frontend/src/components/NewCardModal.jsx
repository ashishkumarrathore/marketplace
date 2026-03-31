import { createSignal, Show } from 'solid-js';
import { addCard } from '../api/client';
import { showToast } from '../store';
import './NewCardModal.css';

export default function NewCardModal(props) {
  const [number, setNumber] = createSignal('');
  const [exp,    setExp]    = createSignal('');
  const [cvv,    setCvv]    = createSignal('');
  const [name,   setName]   = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [errors, setErrors] = createSignal({});

  const displayNum = () => {
    const raw = number().replace(/\D/g, '');
    return raw.replace(/(.{4})/g, '$1 ').trim() || '•••• •••• •••• ••••';
  };
  const displayName  = () => name().trim().toUpperCase() || 'CARDHOLDER NAME';
  const displayExp   = () => exp() || 'MM/YY';
  const cardBrand    = () => {
    const n = number().replace(/\D/g, '');
    if (n.startsWith('4')) return 'VISA';
    if (n.startsWith('5')) return 'MASTERCARD';
    if (n.startsWith('3')) return 'AMEX';
    return '';
  };

  const formatNumber = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
    setNumber(v);
  };
  const formatExp = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
    setExp(v);
  };

  const validate = () => {
    const e = {};
    if (number().replace(/\D/g, '').length < 13) e.number = 'Enter a valid card number';
    if (!/^\d{2}\/\d{2}$/.test(exp()))           e.exp    = 'Use MM/YY format';
    if (cvv().replace(/\D/g, '').length < 3)     e.cvv    = 'CVV must be 3–4 digits';
    if (!name().trim())                           e.name   = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await addCard({ number: number(), exp: exp(), cvv: cvv(), name: name() });
      showToast('✓ Card added successfully');
      props.onAdded?.(result.card);
    } catch (err) {
      showToast(`✕ ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal new-card-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-title">
          💳 Add New Card
          <button class="btn btn-icon btn-ghost" onClick={props.onClose}>✕</button>
        </div>

        {/* Card Preview */}
        <div class="card-preview">
          <div class="card-preview-chip">⬛</div>
          <div class="card-preview-number font-mono">{displayNum()}</div>
          <div class="card-preview-bottom">
            <div>
              <div class="card-preview-label">CARDHOLDER</div>
              <div class="card-preview-value font-mono">{displayName()}</div>
            </div>
            <div>
              <div class="card-preview-label">EXPIRES</div>
              <div class="card-preview-value font-mono">{displayExp()}</div>
            </div>
            <div class="card-preview-brand">{cardBrand()}</div>
          </div>
        </div>

        {/* Form */}
        <div class="new-card-form">
          <div class="form-group full">
            <label class="form-label">Card Number</label>
            <input
              class={`input-field font-mono ${errors().number ? 'input-error' : ''}`}
              placeholder="1234 5678 9012 3456"
              maxlength="19"
              onInput={formatNumber}
            />
            <Show when={errors().number}><div class="form-error">{errors().number}</div></Show>
          </div>
          <div class="new-card-row">
            <div class="form-group">
              <label class="form-label">Expiry Date</label>
              <input
                class={`input-field font-mono ${errors().exp ? 'input-error' : ''}`}
                placeholder="MM/YY" maxlength="5"
                onInput={formatExp}
              />
              <Show when={errors().exp}><div class="form-error">{errors().exp}</div></Show>
            </div>
            <div class="form-group">
              <label class="form-label">CVV</label>
              <input
                class={`input-field font-mono ${errors().cvv ? 'input-error' : ''}`}
                type="password" placeholder="•••" maxlength="4"
                onInput={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
              />
              <Show when={errors().cvv}><div class="form-error">{errors().cvv}</div></Show>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Name on Card</label>
            <input
              class={`input-field ${errors().name ? 'input-error' : ''}`}
              placeholder="Alex Johnson"
              onInput={(e) => setName(e.target.value)}
            />
            <Show when={errors().name}><div class="form-error">{errors().name}</div></Show>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost" onClick={props.onClose}>Cancel</button>
          <button class="btn btn-primary" disabled={saving()} onClick={handleSave}>
            {saving() ? <><div class="spinner" style={{ width: '14px', height: '14px', 'border-width': '2px' }} /> Saving…</> : 'Save Card'}
          </button>
        </div>
      </div>
    </div>
  );
}
