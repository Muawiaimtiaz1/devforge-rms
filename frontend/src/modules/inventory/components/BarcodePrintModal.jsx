import JsBarcode from "jsbarcode";
import { useState } from "react";
import { formatShopCurrency } from "../../../currency";
import InventoryModal from "./InventoryModal";

const safe = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function printVariantBarcode(productName, variant) {
  const barcode = String(variant?.barcode || "").trim();
  if (!barcode) throw new Error("This variant does not have a barcode.");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, barcode, {
    format: "CODE128",
    displayValue: false,
    width: 1.35,
    height: 34,
    margin: 0,
  });
  const frame = document.createElement("iframe");
  frame.className = "barcode-print-frame";
  frame.title = "Barcode print label";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Could not prepare the barcode label.");
  }
  const name = safe(productName);
  const number = safe(barcode);
  const price = safe(formatShopCurrency(variant.selling_price));
  doc.open();
  doc.write(
    `<!doctype html><style>@page{size:30mm 15mm;margin:0}*{box-sizing:border-box}html,body{width:30mm;height:15mm;margin:0;font-family:Arial}.label{width:30mm;height:15mm;padding:.7mm 1mm .55mm;display:grid;grid-template-rows:2.3mm 6.2mm 1.8mm 2.4mm;place-items:center;overflow:hidden}.name{width:100%;overflow:hidden;text-align:center;text-overflow:ellipsis;white-space:nowrap;font-size:2.1mm;font-weight:700}svg{max-width:28mm;width:auto;height:6mm}.number{font:700 1.75mm/1.8mm monospace;letter-spacing:.1mm;white-space:nowrap}.price{font:700 2.1mm/2.4mm Arial,sans-serif;white-space:nowrap}</style><main class='label'><div class='name'>${name}</div>${svg.outerHTML}<div class='number'>${number}</div><div class='price'>${price}</div></main>`,
  );
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 100);
}

export default function BarcodePrintModal({ product, onClose, onError }) {
  const variants = product.stock_variants || [];
  const printable = variants.filter((variant) =>
    String(variant.barcode || "").trim(),
  );
  const [variantId, setVariantId] = useState(() =>
    String(printable[0]?.id || ""),
  );
  const selected = variants.find((variant) => String(variant.id) === variantId);
  function printLabel() {
    try {
      printVariantBarcode(product.name, selected);
      onClose();
    } catch (error) {
      onError(error.message);
    }
  }
  return (
    <InventoryModal
      onClose={onClose}
      label={"Print barcode for " + product.name}
    >
      <div className={"barcode-print-modal"}>
        <header>
          <div>
            <h2>Print Barcode</h2>
            <p>{product.name}</p>
          </div>
          <button type={"button"} onClick={onClose} aria-label={"Close"}>
            ×
          </button>
        </header>
        <fieldset>
          <legend>Which variant do you want to print?</legend>
          <div className={"barcode-variant-options"}>
            {variants.map((variant) => {
              const available = Boolean(String(variant.barcode || "").trim());
              return (
                <label
                  key={variant.id}
                  className={available ? "" : "barcode-variant-disabled"}
                >
                  <input
                    type={"radio"}
                    name={"barcode-variant"}
                    value={variant.id}
                    checked={variantId === String(variant.id)}
                    disabled={!available}
                    onChange={(event) => setVariantId(event.target.value)}
                  />
                  <span>
                    <strong>{variant.name}</strong>
                    <small>
                      {available ? variant.barcode : "No barcode assigned"}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {!printable.length && (
          <div className={"inventory-form-error"}>
            Add a barcode to a product variant before printing.
          </div>
        )}
        <footer>
          <button
            type={"button"}
            className={"inventory-cancel"}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type={"button"}
            className={"inventory-primary"}
            disabled={!selected}
            onClick={printLabel}
          >
            Print Barcode
          </button>
        </footer>
      </div>
    </InventoryModal>
  );
}
