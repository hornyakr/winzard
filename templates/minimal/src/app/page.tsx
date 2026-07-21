import { enforcePageContract } from '@/platform/http/delivery-contract';

import { homePageContract } from './page.contract';

export const runtime = 'nodejs';

enforcePageContract(homePageContract);

export default function Home() {
  return (
    <main>
      <h1>Winzard minimal profile</h1>
    </main>
  );
}
