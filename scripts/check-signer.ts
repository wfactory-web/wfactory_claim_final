import { createThirdwebClient } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";

const secretKey = process.env.THIRDWEB_SECRET_KEY!;
const pk = process.env.MINT_SIGNER_PRIVATE_KEY!;

const client = createThirdwebClient({ secretKey });
const acc = privateKeyToAccount({ client, privateKey: pk });

console.log("Signer address from PK =", acc.address);
