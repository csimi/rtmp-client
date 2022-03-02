# SharedObject messages documentation

The RTMP documentation doesn't explain how Shared Object works.
There is very little information online and even well know libraries like `librtmp` don't implement it.

This document was created by reverse engineering AMF0 messages.

```
 +------+------+-------+-----+-----+------+-----+ +-----+------+-----+
 |Header|Shared|Current|Flags|Event|Event |Event|.|Event|Event |Event|
 |      |Object|Version|     |Type |data  |data |.|Type |data  |data |
 |      |Name  |       |     |     |length|     |.|     |length|     |
 +------+------+-------+-----+-----+------+-----+ +-----+------+-----+
        |                                                            |
        |<- - - - - - - - - - - - - - - - - - - - - - - - - - - - - >|
        |              AMF Shared Object Message body                |
```

## Shared Object Name

UTF8 string without marker (4 bytes UInt32BE length + UTF8 characters).

__This type of string value is used in most event types and will be referred to as `UTF8 string`.__

## Current Version

Size: 4 bytes

Value: UInt32BE

## Flags

Size: 8 bytes?

Value: UInt32BE + UInt32BE

Content unknown, second value seems to always be 0.

Not sure if the two values are both flags or the second one is something undocumented.

## Event Type

Size: 1 byte

Value: UInt8

## Event data length

Size: 4 bytes

Value: UInt32BE

## Event data

### Use (=1)

Flags: 16 and 0

Data: none (length 0)

Example:
```
1, 0, 0, 0, 0
```

### Release (=2)

Flags: 16 and 0

Data: none (length 0)

Example:
```
2, 0, 0, 0, 0
```

### Request Change (=3)

Version: client version

Flags: 16 and 0

Data: UTF8 string (property key) followed by an AMF-encoded value (property value).

Example:
```
3, 0, 0, 0, 11,
0, 3, 'f', 'o', 'o',
2, 0, 3, 'b', 'a', 'r'
```

### Change (=4)

Version: server version

Flags: 16 and 0

Data: UTF8 string (property key) followed by an AMF-encoded value (property value).

Example:
```
4, 0, 0, 0, 11,
0, 3, 'f', 'o', 'o',
2, 0, 3, 'b', 'a', 'r'
```

### Success (=5)

Unknown. Possibly deprecated and replaced by type 13?

### SendMessage (=6)

Unknown. Could be related to .send() and handlerName()?

### Status (=7)

Flags: 16 or 48 and 0

- 48 when read access has been denied as a response to use message
- 16 when write access has ben denied

Data: two UTF8 strings

First value is the code, second one is the level.

Example:
```
7, 0, 0, 0, 34,
0, 25, 'S', 'h', 'a', 'r', 'e', 'd', 'O', 'b', 'j', 'e', 'c', 't', '.', 'N', 'o', 'R', 'e', 'a', 'd', 'A', 'c', 'c', 'e', 's', 's',
0, 5, 'e', 'r', 'r', 'o', 'r'
```

### Clear (=8)

Version: server version

Flags: 16 and 0

Data: none (length 0)

Example:
```
8, 0, 0, 0, 0
```

### Remove (=9)

Version: server version

Flags: 16 and 0 (when triggered by type 10?) or 32 and 0 (when initiated by server?)

Data: UTF8 string (property key)

Example:
```
9, 0, 0, 0, 5,
0, 3, 'f', 'o', 'o'
```

### Request Remove (=10)

Version: client version

Flags: 16 and 0

Data: UTF8 string (property key)

Example:
```
10, 0, 0, 0, 5,
0, 3, 'f', 'o', 'o'
```

### Use Success (=11)

Version: server version

Flags: 48 and 0

Data: none (length 0)

Example:
```
11, 0, 0, 0, 0
```

### Unknown type (=12)

Absolutely undocumented. Can possibly be ignored.

Could have something to do with type 4 events as the string inside is repeated from type 4 keys.

Example (including type 4 event):
```
4, 0, 0, 0, 11, 0, 3, 'f', 'o', 'o', 2, 0, 3, 'b', 'a', 'r',
12, 0, 0, 0, 9, 0, 3, 'f', 'o', 'o', 0, 0, 0, 1
```

### Unknown type (=13)

Seems to be triggered by type 3, basically as an echo with the server version.

Could be change acknowledgement since type 4 is not triggered for the client from which the change originated.

Example (including type 3 event):
```
3, 0, 0, 0, 11, 0, 3, 'f', 'o', 'o', 2, 0, 3, 'b', 'a', 'r'
13, 0, 0, 0, 11, 0, 3, 'f', 'o', 'o', 2, 0, 3, 'b', 'a', 'r'
```

## Unknown type (=14)

Requests to clear the Shared Object.

Version: client version

Flags: 16 and 0

Data: none (length 0)

Example:
```
14, 0, 0, 0, 0
```
