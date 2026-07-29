export const metadata = {
  title: "Subscription active — CueAside",
};

export default function CheckoutSuccess() {
  return (
    <main className="checkout-result">
      <div className="checkout-result-card">
        <Image src="/cueaside-icon.png" alt="" width={64} height={64} />
        <div className="eyebrow">Payment complete</div>
        <h1>Your CueAside subscription is ready.</h1>
        <p>
          Return to CueAside on your Mac. The app will refresh your account
          automatically.
        </p>
        <a className="checkout-result-button" href="cueaside://billing/success">
          Open CueAside
        </a>
      </div>
    </main>
  );
}
import Image from "next/image";
