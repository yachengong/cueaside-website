export const metadata = {
  title: "Checkout canceled — CueAside",
};

export default function CheckoutCanceled() {
  return (
    <main className="checkout-result">
      <div className="checkout-result-card">
        <Image src="/cueaside-icon.png" alt="" width={64} height={64} />
        <div className="eyebrow">No charge made</div>
        <h1>Checkout was canceled.</h1>
        <p>You can return to CueAside and try again whenever you are ready.</p>
        <a className="checkout-result-button secondary" href="cueaside://billing/canceled">
          Return to CueAside
        </a>
      </div>
    </main>
  );
}
import Image from "next/image";
