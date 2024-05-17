
import { keccak256 } from "../crypto/index.js";
import {
    concat, hexlify, assertArgument, toUtf8Bytes
} from "../utils/index.js";


import { ens_normalize } from "@adraffy/ens-normalize";

const Zeros = new Uint8Array(32);
Zeros.fill(0);

