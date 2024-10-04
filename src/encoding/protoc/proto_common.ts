/**
 * Generated by the protoc-gen-ts. DO NOT EDIT! compiler version: 5.28.2 source: proto_common.proto git:
 * https://github.com/thesayyn/protoc-gen-ts
 */
import * as pb_1 from 'google-protobuf';
// eslint-disable-next-line
export namespace common {
    export class ProtoLocation extends pb_1.Message {
        #one_of_decls: number[][] = [];
        constructor(
            data?:
                | any[]
                | {
                      value?: Uint8Array;
                  },
        ) {
            super();
            pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [], this.#one_of_decls);
            if (!Array.isArray(data) && typeof data == 'object') {
                if ('value' in data && data.value != undefined) {
                    this.value = data.value;
                }
            }
        }
        get value() {
            return pb_1.Message.getFieldWithDefault(this, 1, new Uint8Array(0)) as Uint8Array;
        }
        set value(value: Uint8Array) {
            pb_1.Message.setField(this, 1, value);
        }
        static fromObject(data: { value?: Uint8Array }): ProtoLocation {
            const message = new ProtoLocation({});
            if (data.value != null) {
                message.value = data.value;
            }
            return message;
        }
        toObject() {
            const data: {
                value?: Uint8Array;
            } = {};
            if (this.value != null) {
                data.value = this.value;
            }
            return data;
        }
        serialize(): Uint8Array;
        serialize(w: pb_1.BinaryWriter): void;
        serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
            const writer = w || new pb_1.BinaryWriter();
            if (this.value.length) writer.writeBytes(1, this.value);
            if (!w) return writer.getResultBuffer();
        }
        static deserialize(bytes: Uint8Array | pb_1.BinaryReader): ProtoLocation {
            const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes),
                message = new ProtoLocation();
            while (reader.nextField()) {
                if (reader.isEndGroup()) break;
                switch (reader.getFieldNumber()) {
                    case 1:
                        message.value = reader.readBytes();
                        break;
                    default:
                        reader.skipField();
                }
            }
            return message;
        }
        serializeBinary(): Uint8Array {
            return this.serialize();
        }
        static deserializeBinary(bytes: Uint8Array): ProtoLocation {
            return ProtoLocation.deserialize(bytes);
        }
    }
    export class ProtoHash extends pb_1.Message {
        #one_of_decls: number[][] = [];
        constructor(
            data?:
                | any[]
                | {
                      value?: Uint8Array;
                  },
        ) {
            super();
            pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [], this.#one_of_decls);
            if (!Array.isArray(data) && typeof data == 'object') {
                if ('value' in data && data.value != undefined) {
                    this.value = data.value;
                }
            }
        }
        get value() {
            return pb_1.Message.getFieldWithDefault(this, 1, new Uint8Array(0)) as Uint8Array;
        }
        set value(value: Uint8Array) {
            pb_1.Message.setField(this, 1, value);
        }
        static fromObject(data: { value?: Uint8Array }): ProtoHash {
            const message = new ProtoHash({});
            if (data.value != null) {
                message.value = data.value;
            }
            return message;
        }
        toObject() {
            const data: {
                value?: Uint8Array;
            } = {};
            if (this.value != null) {
                data.value = this.value;
            }
            return data;
        }
        serialize(): Uint8Array;
        serialize(w: pb_1.BinaryWriter): void;
        serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
            const writer = w || new pb_1.BinaryWriter();
            if (this.value.length) writer.writeBytes(1, this.value);
            if (!w) return writer.getResultBuffer();
        }
        static deserialize(bytes: Uint8Array | pb_1.BinaryReader): ProtoHash {
            const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes),
                message = new ProtoHash();
            while (reader.nextField()) {
                if (reader.isEndGroup()) break;
                switch (reader.getFieldNumber()) {
                    case 1:
                        message.value = reader.readBytes();
                        break;
                    default:
                        reader.skipField();
                }
            }
            return message;
        }
        serializeBinary(): Uint8Array {
            return this.serialize();
        }
        static deserializeBinary(bytes: Uint8Array): ProtoHash {
            return ProtoHash.deserialize(bytes);
        }
    }
    export class ProtoHashes extends pb_1.Message {
        #one_of_decls: number[][] = [];
        constructor(
            data?:
                | any[]
                | {
                      hashes?: ProtoHash[];
                  },
        ) {
            super();
            pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [1], this.#one_of_decls);
            if (!Array.isArray(data) && typeof data == 'object') {
                if ('hashes' in data && data.hashes != undefined) {
                    this.hashes = data.hashes;
                }
            }
        }
        get hashes() {
            return pb_1.Message.getRepeatedWrapperField(this, ProtoHash, 1) as ProtoHash[];
        }
        set hashes(value: ProtoHash[]) {
            pb_1.Message.setRepeatedWrapperField(this, 1, value);
        }
        static fromObject(data: { hashes?: ReturnType<typeof ProtoHash.prototype.toObject>[] }): ProtoHashes {
            const message = new ProtoHashes({});
            if (data.hashes != null) {
                message.hashes = data.hashes.map((item) => ProtoHash.fromObject(item));
            }
            return message;
        }
        toObject() {
            const data: {
                hashes?: ReturnType<typeof ProtoHash.prototype.toObject>[];
            } = {};
            if (this.hashes != null) {
                data.hashes = this.hashes.map((item: ProtoHash) => item.toObject());
            }
            return data;
        }
        serialize(): Uint8Array;
        serialize(w: pb_1.BinaryWriter): void;
        serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
            const writer = w || new pb_1.BinaryWriter();
            if (this.hashes.length)
                writer.writeRepeatedMessage(1, this.hashes, (item: ProtoHash) => item.serialize(writer));
            if (!w) return writer.getResultBuffer();
        }
        static deserialize(bytes: Uint8Array | pb_1.BinaryReader): ProtoHashes {
            const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes),
                message = new ProtoHashes();
            while (reader.nextField()) {
                if (reader.isEndGroup()) break;
                switch (reader.getFieldNumber()) {
                    case 1:
                        reader.readMessage(message.hashes, () =>
                            pb_1.Message.addToRepeatedWrapperField(
                                message,
                                1,
                                ProtoHash.deserialize(reader),
                                ProtoHash,
                            ),
                        );
                        break;
                    default:
                        reader.skipField();
                }
            }
            return message;
        }
        serializeBinary(): Uint8Array {
            return this.serialize();
        }
        static deserializeBinary(bytes: Uint8Array): ProtoHashes {
            return ProtoHashes.deserialize(bytes);
        }
    }
    export class ProtoAddress extends pb_1.Message {
        #one_of_decls: number[][] = [];
        constructor(
            data?:
                | any[]
                | {
                      value?: Uint8Array;
                  },
        ) {
            super();
            pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [], this.#one_of_decls);
            if (!Array.isArray(data) && typeof data == 'object') {
                if ('value' in data && data.value != undefined) {
                    this.value = data.value;
                }
            }
        }
        get value() {
            return pb_1.Message.getFieldWithDefault(this, 1, new Uint8Array(0)) as Uint8Array;
        }
        set value(value: Uint8Array) {
            pb_1.Message.setField(this, 1, value);
        }
        static fromObject(data: { value?: Uint8Array }): ProtoAddress {
            const message = new ProtoAddress({});
            if (data.value != null) {
                message.value = data.value;
            }
            return message;
        }
        toObject() {
            const data: {
                value?: Uint8Array;
            } = {};
            if (this.value != null) {
                data.value = this.value;
            }
            return data;
        }
        serialize(): Uint8Array;
        serialize(w: pb_1.BinaryWriter): void;
        serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
            const writer = w || new pb_1.BinaryWriter();
            if (this.value.length) writer.writeBytes(1, this.value);
            if (!w) return writer.getResultBuffer();
        }
        static deserialize(bytes: Uint8Array | pb_1.BinaryReader): ProtoAddress {
            const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes),
                message = new ProtoAddress();
            while (reader.nextField()) {
                if (reader.isEndGroup()) break;
                switch (reader.getFieldNumber()) {
                    case 1:
                        message.value = reader.readBytes();
                        break;
                    default:
                        reader.skipField();
                }
            }
            return message;
        }
        serializeBinary(): Uint8Array {
            return this.serialize();
        }
        static deserializeBinary(bytes: Uint8Array): ProtoAddress {
            return ProtoAddress.deserialize(bytes);
        }
    }
    export class ProtoNumber extends pb_1.Message {
        #one_of_decls: number[][] = [];
        constructor(
            data?:
                | any[]
                | {
                      value?: number;
                  },
        ) {
            super();
            pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [], this.#one_of_decls);
            if (!Array.isArray(data) && typeof data == 'object') {
                if ('value' in data && data.value != undefined) {
                    this.value = data.value;
                }
            }
        }
        get value() {
            return pb_1.Message.getFieldWithDefault(this, 1, 0) as number;
        }
        set value(value: number) {
            pb_1.Message.setField(this, 1, value);
        }
        static fromObject(data: { value?: number }): ProtoNumber {
            const message = new ProtoNumber({});
            if (data.value != null) {
                message.value = data.value;
            }
            return message;
        }
        toObject() {
            const data: {
                value?: number;
            } = {};
            if (this.value != null) {
                data.value = this.value;
            }
            return data;
        }
        serialize(): Uint8Array;
        serialize(w: pb_1.BinaryWriter): void;
        serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
            const writer = w || new pb_1.BinaryWriter();
            if (this.value != 0) writer.writeUint64(1, this.value);
            if (!w) return writer.getResultBuffer();
        }
        static deserialize(bytes: Uint8Array | pb_1.BinaryReader): ProtoNumber {
            const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes),
                message = new ProtoNumber();
            while (reader.nextField()) {
                if (reader.isEndGroup()) break;
                switch (reader.getFieldNumber()) {
                    case 1:
                        message.value = reader.readUint64();
                        break;
                    default:
                        reader.skipField();
                }
            }
            return message;
        }
        serializeBinary(): Uint8Array {
            return this.serialize();
        }
        static deserializeBinary(bytes: Uint8Array): ProtoNumber {
            return ProtoNumber.deserialize(bytes);
        }
    }
    export class ProtoLocations extends pb_1.Message {
        #one_of_decls: number[][] = [];
        constructor(
            data?:
                | any[]
                | {
                      locations?: ProtoLocation[];
                  },
        ) {
            super();
            pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [1], this.#one_of_decls);
            if (!Array.isArray(data) && typeof data == 'object') {
                if ('locations' in data && data.locations != undefined) {
                    this.locations = data.locations;
                }
            }
        }
        get locations() {
            return pb_1.Message.getRepeatedWrapperField(this, ProtoLocation, 1) as ProtoLocation[];
        }
        set locations(value: ProtoLocation[]) {
            pb_1.Message.setRepeatedWrapperField(this, 1, value);
        }
        static fromObject(data: { locations?: ReturnType<typeof ProtoLocation.prototype.toObject>[] }): ProtoLocations {
            const message = new ProtoLocations({});
            if (data.locations != null) {
                message.locations = data.locations.map((item) => ProtoLocation.fromObject(item));
            }
            return message;
        }
        toObject() {
            const data: {
                locations?: ReturnType<typeof ProtoLocation.prototype.toObject>[];
            } = {};
            if (this.locations != null) {
                data.locations = this.locations.map((item: ProtoLocation) => item.toObject());
            }
            return data;
        }
        serialize(): Uint8Array;
        serialize(w: pb_1.BinaryWriter): void;
        serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
            const writer = w || new pb_1.BinaryWriter();
            if (this.locations.length)
                writer.writeRepeatedMessage(1, this.locations, (item: ProtoLocation) => item.serialize(writer));
            if (!w) return writer.getResultBuffer();
        }
        static deserialize(bytes: Uint8Array | pb_1.BinaryReader): ProtoLocations {
            const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes),
                message = new ProtoLocations();
            while (reader.nextField()) {
                if (reader.isEndGroup()) break;
                switch (reader.getFieldNumber()) {
                    case 1:
                        reader.readMessage(message.locations, () =>
                            pb_1.Message.addToRepeatedWrapperField(
                                message,
                                1,
                                ProtoLocation.deserialize(reader),
                                ProtoLocation,
                            ),
                        );
                        break;
                    default:
                        reader.skipField();
                }
            }
            return message;
        }
        serializeBinary(): Uint8Array {
            return this.serialize();
        }
        static deserializeBinary(bytes: Uint8Array): ProtoLocations {
            return ProtoLocations.deserialize(bytes);
        }
    }
}
