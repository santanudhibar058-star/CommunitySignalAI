"""Create Web Push VAPID keys and update only their entries in the project .env."""

import base64
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"


def main():
    if not ENV_PATH.exists():
        raise SystemExit("Create the project-root .env first by copying .env.example.")

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_der = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_key = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode("ascii")
    # pywebpush accepts Base64-encoded DER in its string form.
    private_key_b64 = base64.b64encode(private_der).decode("ascii")

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    values = {
        "PEOPLECARE_VAPID_PUBLIC_KEY": public_key,
        "PEOPLECARE_VAPID_PRIVATE_KEY_B64": private_key_b64,
    }
    found = set()
    updated = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in values:
            updated.append(f"{key}={values[key]}")
            found.add(key)
        else:
            updated.append(line)
    updated.extend(f"{key}={value}" for key, value in values.items() if key not in found)
    ENV_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    print("New VAPID keys were written to the ignored project .env; private values were not printed.")
    print("Copy the VAPID values into your hosting environment before enabling phone alerts there.")


if __name__ == "__main__":
    main()
