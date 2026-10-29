import Link from "next/link";
import { Footer, Header } from "@/components/chrome";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="lost">
        <div>
          <h1 className="h2">Nothing at this address</h1>
          <p>The page does not exist, or the address in the link is not a Solana address.</p>
          <Link className="btn btn-acc" href="/">Map a token</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
