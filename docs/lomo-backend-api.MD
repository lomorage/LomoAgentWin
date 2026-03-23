Backend of lomorage application


[TOC]

# Arguments
```
   --backup-time value               daily local backup time. Format is like hh:mm:ss. Timezone is local running machine timezone (default: "02:00:00")
   --base value, -b value            base directory to store db file (default: "/go/src/bitbucket.org/lomoware/lomo-backend/cmd/lomod")
   --check-interval value            interval to run consistent check. Unit in day (default: 7)
   --chromecast-poll-duration value  chromecast device poll duration (default: 10m0s)
   --dir-perm value                  dir permission when creating asset file (default: "750")
   --file-perm value                 file permission when creating asset file (default: "644")
   --log-dir value                   logfile directory
   --mdns-domain value               mdns search domain name (default: "local.")
   --mdns-name value                 mdns service name (default: "lomod-dev")
   --mdns-service value              mdns service type (default: "_lomod._tcp")
   --mount-dir value                 mount directory to find out mounted usb disk (default: "/media")
   --no-mdns                         disable mdns for service discovery
   --with-mount-mon                  enable mount monitor utility
   --port value, -p value            (default: 8000)
   --port-https value                (default: 8443)
   --preview-size value              list of image preview size. Multiple resolution is supported, and each is separated with ';'. Format is like <width1>x<height1>;<width2>x<height2>;... (default: "75x0;320x0")
   --preview-size-video value        list of video preview size. Multiple resolution is supported, and each is separated with ';'. Format is like <width1>x<height1>;<width2>x<height2>;... (default: "480x0")
   --help, -h                        show help
   --version, -v                     print the version
```

Hidden arguments
```
   --admin-token value               admin token for some APIs
   --debug                           debug mode for easy development
   --exe-dir value                   executable directory for tools like avconv
   --lets-staging                    use lets encrypt staging API endpoint
   --max-capture-duration value      max capture duration (default: 5m0s)
   --max-fetch-preview value         max concurrent request for fetch preview (default: 5)
   --max-file-size value             max capture file size in MB (default: 50)
   --max-upload value                max concurrent request for asset upload request (default: 3)
   --no-memdb                        disable memdb and read from db directly
   --no-stdout                       disable stdout, which is mainly used at daemon mode at production
   --remote-ping value               public ping target IP in case of debugging (default: "8.8.8.8")
   --samba-conf value                samba configuration file and lomorage will append
```

`lomod --base /home/ubuntu/Documents --port 8080`

# API Authentication
Once login, client will get one token. Succeeding request need carry token in HTTP header for security purpose. Token format is `token=<token>`.
```
curl -s -H "Authorization: token=573944500" 127.0.0.1:8000/mount
```
Token can be put as part of query string, mainly for debug purpose.
```
curl -s "127.0.0.1:8000/mount?token=573944500"
```


# Mount Management
## List Mount
When system is firstly used, there is no user in the system. So client can call API without username and token data. Note that unit of size is MB. `Error` field will signal the user the status of the mount disk.
UUID is the mount device's unique identifier. Its value is based on mount type.
3 Types are supported:

1. LocalFS: the directory is local file system. UUID is empty.
2. USB: the directory is mounted from USB. UUID is USB device's UUID.
3. Network: the directory is network mount. UUID is the mac address of network device

```
$ curl -s "127.0.0.1:8000/mount"| python -m json.tool
[
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "USB",
        "UUID": "e4fd830d-8d75-46aa-9870-b2fc405f81e7",
        "Dir": "media/01234567",
        "FreeSize": 56,
        "TotalSize": 57,
        "Error": "mkdir /media/01234567/lomod_probe_write: permission denied"
    }
]
```
After user is created, it must use token to get mount information
```
$ curl -s 127.0.0.1:8000/mount
{
    "id": "4",
    "text": "Invalid Token"
}
$ curl -s "127.0.0.1:8000/mount?token=573944500" | python -m json.tool
[
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "USB",
        "UUID": "e4fd830d-8d75-46aa-9870-b2fc405f81e7",
        "Dir": "media/01234567",
        "FreeSize": 56,
        "TotalSize": 57,
        "Error": "mkdir /media/01234567/lomod_probe_write: permission denied"
    }
]
```

## Mount folder permission
Looking at `Error` field in reply message, `media` directory has empty value which means good to write, but `media/01234567` has permission denied. It can also be found by
```
$ ls -l /media/
total 4
drwxr-xr-x 3 root root 4096 Mar  5 21:55 01234567
$ ls -l /media/01234567/
total 16
drwx------ 2 root root 16384 Mar  5 21:55 lost+found
```

After changing to pi user, it has right information now
```
$ ls -l /media/01234567/
total 16
drwx------ 2 pi pi 16384 Mar  5 21:55 lost+found
$ ls -l /media/
total 4
drwxr-xr-x 3 pi pi 4096 Mar  5 21:55 01234567

$ curl -s "127.0.0.1:8000/mount?token=573944500" | python -m json.tool
[
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "USB",
        "UUID": "e4fd830d-8d75-46aa-9870-b2fc405f81e7",
        "Dir": "media/01234567",
        "FreeSize": 56,
        "TotalSize": 57,
        "Error": ""
    }
]
```
## Remote NFS mount
User can mount remote device to same base mount directory, it will also show up during above api. Below is one example for apple time carousel
```
$ sudo mount -t cifs //10.0.1.1/Data -o username=root,password=rootroot,sec=ntlm,vers=1.0 /media/airport
$ curl -s "127.0.0.1:8000/mount?token=573944500" | python -m json.tool
[
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "USB",
        "UUID": "e4fd830d-8d75-46aa-9870-b2fc405f81e7",
        "Dir": "media/01234567",
        "FreeSize": 56,
        "TotalSize": 57,
        "Error": ""
    },
    {
        "Type": "Network",
        "UUID": "88:1f:a1:28:13:9e",
        "Dir": "media/airport",
        "FreeSize": 22568,
        "TotalSize": 1905681,
        "Error": "mkdir /media/airport/lomod_probe_write: permission denied"
    }
]
```

## Mount device UUID
UUID is another field in mount reply to uniquely identify the mount USB device (device UUID) or remote NFS mount (remote server's MAC address). Client should cache the UUID and prompt user if another device has the same UUID. One use case is remote mount is not exist, list mount may still return the folder, with empty UUID
```
$ sudo umount /media/airport
$ curl -s "127.0.0.1:8000/mount?token=573944500" | python -m json.tool
[
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "USB",
        "UUID": "e4fd830d-8d75-46aa-9870-b2fc405f81e7",
        "Dir": "media/01234567",
        "FreeSize": 56,
        "TotalSize": 57,
        "Error": ""
    },
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media/airport",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    }
]
```
This is same for USB device too. Backend will detect the change, and change type accordingly
```
$ sudo umount /media/01234567
$ curl -s "127.0.0.1:8000/mount?token=573944500" | python -m json.tool
[
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media/01234567",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    },
    {
        "Type": "LocalFS",
        "UUID": "",
        "Dir": "media/airport",
        "FreeSize": 1449123,
        "TotalSize": 2799571,
        "Error": ""
    }
]
```
## User mount status
When user is created, system API will return its mount status
```
$ curl -s 127.0.0.1:8000/system?token=765552045 | python -m json.tool
{
    "APIVersion": "1.0",
    "UUID": "43e229b6-de2a-48de-aa8c-029682169c13",
    "DiskStatus": "",
    "LastBackup": {},
    "ListenIPs": [
        "10.0.1.66"
    ],
    "LomodVersion": "35961f7d207b",
    "NetworkStatus": "ok",
    "OS": "linux",
    "OSDiskFreeSize": 6174,
    "OSStatus": {
        "CPU": {
            "Count": 4
        },
        "Disk": {
            "FreeSizeInMB": 6174,
            "Status": ""
        },
        "Memory": {
            "CachedInMB": 241,
            "FreeInMB": 440,
            "TotalInMB": 872,
            "UsedInMB": 204
        },
        "Network": {
            "ListenIPs": [
                "10.0.1.66"
            ],
            "PublicAddrs": [],
            "Status": "ok"
        },
        "TimeZone": {
            "Name": "PDT",
            "Offset": -7
        },
        "Uptime": "1m35s"
    },
    "PublicAddr": [],
    "SystemStatus": 1,
    "TimezoneName": "PDT",
    "TimezoneOffset": -7,
    "UserDisks": [
        {
            "Error": "",
            "FreeSize": 1334,
            "Username": "alice"
        }
    ],
    "UserStatus": {
      "alice": {
        "AssetSummary": {
          "jpg": {
            "Count": 3,
            "Size": 1438014
          },
          "mp4": {
            "Count": 1,
            "Size": 7360
          },
          "png": {
            "Count": 1,
            "Size": 44969
          },
          "zip": {
            "Count": 1,
            "Size": 238254
          }
        },
        "HomeDisk": {
          "Status": "",
          "ErrorCode": 0,
          "FreeSizeInMB": 1334
        }
      },
      "bob": {
        "AssetSummary": {
          "heic": {
            "Count": 1,
            "Size": 1051433
          },
          "jpg": {
            "Count": 2,
            "Size": 318272
          },
          "zip": {
            "Count": 1,
            "Size": 1055380
          }
        },
        "HomeDisk": {
          "Status": "",
          "ErrorCode": 0,
          "FreeSizeInMB": 1400423
        }
      }
    }
}
```
In above reply gives the alice's home disk status and free size. Empty status means disk is good
```
    "UserStatus": {
        "alice": {
            "HomeDisk": {
                "FreeSizeInMB": 1334,
                "ErrorCode": 0,
                "Status": ""
            }
        }
    }
```
If USB disk is removed, it will have below result
```
    "UserStatus": {
        "alice": {
            "HomeDisk": {
                "FreeSizeInMB": 0,
                "ErrorCode": 14,
                "Status": "Device is not mounted yet"
            }
        }
    }
```
When disk is plugged again, lomod will detect and return current status
```
    "UserStatus": {
        "alice": {
            "HomeDisk": {
                "FreeSizeInMB": 1333,
                "ErrorCode": 0,
                "Status": ""
            }
        }
    }
``` 
## Unmount
Client can notify backend to unmount one given path. Note that query string in URL should be escaped
```
$ curl -X DELETE http://127.0.0.1:8000/system/mount?token=1234567&path=/media/home
```

# User Management
## Create User
Create user with json file. First user doesn't need token, and will be admin of the home. Once it is created, he need login, and use token to create other users.
```
$ cat ./test/sample_user_alice.json
{
    "Name":"alice",
    "Password": "alice123",
    "Phone": "4084088888",
    "Email": "alice@lomorage.io",
    "NickName": "Alice",
    "HomeDir": "/tmp/usbdisk1/alice"
}
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/sample_user_alice.json "127.0.0.1:8000/user"

```

## Create User and enable Samba share
Client can also create one bot user, such as lomoframe. Its samba password is another SHA1 of password specified in json. This is to make sure right length of password
```
$ cat ./test/sample_lomoframe.json
{
    "Name":"frame1",
    "Password": "frame123",
    "NickName": "TV frame",
    "HomeDir": "/tmp/usbdisk1/frame1",
    "BotUser": true
}
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/sample_lomoframe.json "127.0.0.1:8000/user"

```
By default, lomod will use its own samba global configuration. For users who already have their own samba configuration, they can use `--samba-conf <config file>` option to specify the configuration file. If `<config file>` is not absolute path, lomod will take `base` directory + config file to load the configuration.

## Delete user
The user can be deleted by below api. It can also be deleted via admin token
```
$ curl -s -X DELETE "127.0.0.1:8000/user/frame1?token=12345"
```

## Chromecast integration
Lomod backend has integrated with chromecast by google cast API. It follows the same share workflow. The only difference is client need provide more chromecast metadata during user creation. After that, client can just share photo or video as bot or regular user

```
# curl -X POST -d '{"Name":"87a600ca350e3837a2abb42875fe487a", "Password": "alice123", "BotUser": true, "Metadatas":[
        {"Name":"ChromecastUUID", "Value": "87a600ca350e3837a2abb42875fe487a"},
        {"Name":"ChromecastName", "Value": "Family Room TV"},
        {"Name":"ChromecastIP", "Value": "10.0.1.19"},
        {"Name":"ChromecastPort", "Value": "8009"}]}' -H "Content-Type: application/json" "127.0.0.1:8000/user?token=1234567"
```
Lomod also supports auto register chromecast device. It will use MDNS to auto discover chromecast device, and create new user if it is not exist, or update device IP/port if they are changed. In this mode, both username and password will be device UUID.
After creation, client can use list api to get new user list. Chromecast user should have the metadata

```
$ curl -s  "127.0.0.1:8000/user?token=1234567" | python -m json.tool
{
  "Users": [
    {
      "ID": 7,
      "Status": 0,
      "Name": "chromecast-87a600ca350e3837a2abb42875fe487a",
      "Password": "",
      "Phone": "",
      "Email": "",
      "NickName": "",
      "HomeDir": "",
      "BackupDir": "",
      "SubDomain": "",
      "LastLogin": "2020-10-19T06:50:56Z",
      "BotUser": true,
      "Metadatas": {
          "DeviceIP": "10.0.1.19",
          "DeviceName": "Family Room TV",
          "DevicePort": "8009",
          "DeviceSubType": "Chromecast",
          "DeviceType": "chromecast",
          "DeviceUUID": "87a600ca350e3837a2abb42875fe487a"
      },
    },
    {
      "ID": 1,
      "Status": 0,
      "Name": "alice",
      "Password": "",
      "Phone": "",
      "Email": "",
      "NickName": "alice",
      "HomeDir": "/media/pi/disk1/alice",
      "BackupDir": "",
      "SubDomain": "",
      "LastLogin": "",
      "BotUser": false,
      "Metadatas": {}
    },
    {
      "ID": 2,
      "Status": 0,
      "Name": "bob",
      "Password": "",
      "Phone": "",
      "Email": "",
      "NickName": "bob",
      "HomeDir": "/media/pi/disk1/bob",
      "BackupDir": "",
      "SubDomain": "",
      "LastLogin": "",
      "BotUser": false,
      "Metadatas": {}
    },
    {
      "ID": 5,
      "Status": 1,
      "Name": "test123",
      "Password": "",
      "Phone": "4084088888",
      "Email": "alice@lomorage.io",
      "NickName": "Alice",
      "HomeDir": "/go/src/bitbucket.org/lomoware/lomo-backend/cmd/lomod/usr/test123",
      "BackupDir": "",
      "SubDomain": "",
      "LastLogin": "2020-08-29T22:50:23Z",
      "BotUser": true,
      "Metadatas": {}
    }
  ]
}
```

## User Login
by default, client should use http basic access authentication mechanism for login, and lomod will return token for future query, and user id as well. https://en.wikipedia.org/wiki/Basic_access_authentication
for example, if username is alice, password is alice123, and login device is iphonex, client should add below HTTP header
```
Authorization: Basic YWxpY2U6YWxpY2UxMjM6aXBob25leA==
```
Note that client should also send device name in case it can log in from different devices. Thus, before base 64 encoding, its format should be `<username>:<password>:<device id>`.

For easy development, client can also add username, password, current device into query string as below.
```
$ curl -s "127.0.0.1:8000/login?username=alice&password=alice123&device=iphonex"
{"Token":"573944500","Userid":1}
```
Then alice can use this token to create other users. Token is better be part of HTTP header for security purpose. Token format is `token=<token>`
```
$ curl -s -X POST -H "Authorization: token=573944500" -H "Content-Type: application/json" --data-binary @./test/sample_user_bob.json "127.0.0.1:8000/user"
```
Token can be put as part of query string, mainly for debug purpose.
```
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/sample_user_bob.json "127.0.0.1:8000/user?token=573944500"
```

### List Users
List users. Only logged in user or use admin token can list users
```
$ curl -s  "10.0.1.22:8000/user?token=573944500" | python -m json.tool
{
    "Users": [
        {
            "BackupDir": "/tmp/backup/alice",
            "BotUser": false,
            "Email": "alice@lomorage.io",
            "HomeDir": "/tmp/alice",
            "ID": 1,
            "Keepalive": null,
            "LastLogin": "2019-06-23T22:58:12Z",
            "Name": "alice",
            "NickName": "Alice",
            "Password": "",
            "Phone": "alice123",
            "Status": 0,
            "SubDomain": ""
        },
        {
            "BackupDir": "",
            "BotUser": false,
            "Email": "bob@lomorage.io",
            "HomeDir": "/tmp/bob",
            "ID": 2,
            "LastLogin": "2019-06-23T22:58:18Z",
            "Name": "bob",
            "NickName": "Bob",
            "Password": "",
            "Phone": "bob123",
            "Status": 0,
            "SubDomain": ""
        },
        {
            "BackupDir": "",
            "BotUser": false,
            "Email": "charlie@lomorage.io",
            "HomeDir": "/tmp/charlie",
            "ID": 3,
            "LastLogin": "2019-06-23T22:58:19Z",
            "Name": "charlie",
            "NickName": "Charlie",
            "Password": "",
            "Phone": "charlie123",
            "Status": 0,
            "SubDomain": ""
        },
        {
            "BackupDir": "",
            "BotUser": false,
            "Email": "denny@lomorage.io",
            "HomeDir": "/tmp/denny",
            "ID": 4,
            "LastLogin": "2019-06-23T22:58:19Z",
            "Name": "denny",
            "NickName": "Denny",
            "Password": "",
            "Phone": "denny123",
            "Status": 0,
            "SubDomain": ""
        },
        {
            "BackupDir": "",
            "BotUser": true,
            "Email": "alice@lomorage.io",
            "HomeDir": /opt/lomorage/usr/lomoframe-yn2c",
            "ID": 8,
            "Keepalive": {
                "lomoc-lomorage-lomod": {
                    "IP": "10.0.1.45",
                    "LastSeen": "2020-07-18T15:12:25Z",
                    "Port": 8003
                }
            },
            "LastLogin": "2020-07-18T15:10:23Z",
            "Name": "lomoframe-yn2c",
            "NickName": "frame",
            "Password": "",
            "Phone": "4084088888",
            "Status": 2,
            "SubDomain": ""
        }
    ]
}
```

### List disk capacity for the user
```
$ curl -s  "127.0.0.1:8000/user/space?token=573944500" | python -m json.tool
{
    "Dir": "/tmp/usbdisk1/alice",
    "FreeSize": 69132,
    "TotalSize": 239172
}
```
### Update user
After user is created, all information can be updated with the non-empty field in user json. Note that "Name" field must be present during update
```
$ curl -X POST -d '{"Name":"alice", "Password": "alice123", "Phone": "4084088888", "Email": "alice@lomorage.io", "NickName": "Alice", "HomeDir": "/tmp/alice"}' -H "Content-T
ype: application/json" "127.0.0.1:8000/user"
$ curl -s 127.0.0.1:8000/user | python -m json.tool
{
    "Users": [
        {
            "BackupDir": "",
            "Email": "alice@lomorage.io",
            "HomeDir": "/tmp/alice",
            "ID": 1,
            "Name": "alice",
            "NickName": "Alice",
            "Password": "",
            "Phone": "4084088888",
            "SubDomain": ""
        }
    ]
}
$ curl -s "127.0.0.1:8000/login?username=alice&password=alice123&device=iphonex" | python -m json.tool
{
    "Token": "362648029",
    "Userid": 1
}
$ curl -s -X PUT -d '{"Name":"alice", "Phone": "1234567"}' -H "Content-Type: application/json" "127.0.0.1:8000/user?token=362648029"
$ curl -s 127.0.0.1:8000/user | python -m json.tool
{
    "Users": [
        {
            "BackupDir": "",
            "Email": "alice@lomorage.io",
            "HomeDir": "/tmp/alice",
            "ID": 1,
            "Name": "alice",
            "NickName": "Alice",
            "Password": "",
            "Phone": "1234567",
            "SubDomain": ""
        }
    ]
}
$ curl -s -X PUT -d '{"Name":"alice", "Email": "444"}' -H "Content-Type: application/json" "127.0.0.1:8000/user?token=362648029"
$ curl -s 127.0.0.1:8000/user | python -m json.tool
{
    "Users": [
        {
            "BackupDir": "",
            "Email": "444",
            "HomeDir": "/tmp/alice",
            "ID": 1,
            "Name": "alice",
            "NickName": "Alice",
            "Password": "",
            "Phone": "1234567",
            "SubDomain": ""
        }
    ]
}
```
Note that password can be updated with the same approach. After changing the password, old token will be deleted. User has to login again to get new token
```
$ curl -s -X PUT -d '{"Name":"alice", "Password": "1234567"}' -H "Content-Type: application/json" "127.0.0.1:8000/user?token=362648029"
$ curl -s 127.0.0.1:8000/user/space?token=362648029 | python -m json.tool
{
    "id": "0",
    "text": "sql: no rows in result set"
}
$ curl -s "127.0.0.1:8000/login?username=alice&password=362648029&device=iphonex" | python -m json.tool
{
    "id": "3",
    "text": "Invalid Username/Password"
}
$ curl -s "127.0.0.1:8000/login?username=alice&password=1234567&device=iphonex" | python -m json.tool
{
    "Token": "135055895",
    "Userid": 1
}
$ curl -s 127.0.0.1:8000/user/space?token=135055895 | python -m json.tool
{
    "Dir": "/tmp/alice",
    "FreeSize": 19806,
    "TotalSize": 239172
}
```
## User setting store and retrieve 
Mobile client can always save and retrieve phone setting through below APIs. Every update operation will override previous setting. So it's client side responsibility to upload the whole set.
Note that backend will read device ID based on token, and save or get conf based on combination of user id and device id.
```
$ curl 127.0.0.1:8000/user/conf?token=1234567
{"id": "0", "text": "sql: no rows in result set"}
$ curl -X POST -d '{"test": "hi"}' 127.0.0.1:8000/user/conf?token=1234567
$ $ curl 127.0.0.1:8000/user/conf?token=1234567
{"test": "hi"}
$ curl -X POST -d '{"new": "key"}' 127.0.0.1:8000/user/conf?token=1234567
$ $ curl 127.0.0.1:8000/user/conf?token=1234567
{"new": "key"}
```

## Admin Token
In case user forgets password, they can use admin token to update password. Admin token is generated and passed through arguments. Caller need know the token and send as other token.
Update method is same as above.

# Asset Management
## Upload Asset
Upload one asset. Note that after upload, asset EXIF data will be analysis, and stored at corresponding location. The asset's created name and sha-1 will be returned
Note that below was created at local time 2003_11_23, but when it is stored, it is converted to 2003-11-24 UTC time.
Note that client MUST provide SHA1 value in request, backend will compare SHA1 with uploaded asset, if they are different, backend will return error "Uploaded asset has different hash", which refer at error code section.
```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_23.jpg  "127.0.0.1:8000/asset/wrongvalue?token=573944500&ext=jpg&createtime=2003-11-23T12:00:00Z"
{"id": "24", "text": "Uploaded asset has different hash"}
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_23.jpg  "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=573944500&ext=jpg&createtime=2003-11-23T12:00:00Z" | python -m json.tool
{
    "Date": "2003-11-23T12:00:00Z",
    "Device": "iphonex",
    "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
    "Name": "1.jpg",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00"
}
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_01_1.jpg  "127.0.0.1:8000/asset/7426655f042e8605385cb413de639373b934b18d?token=573944500&ext=jpg&createtime=2003-11-01T16:00:00Z" | python -m json.tool
{
    "Date": "2003-11-01T16:00:00Z",
    "Device": "iphonex",
    "Hash": "7426655f042e8605385cb413de639373b934b18d",
    "Name": "2.jpg",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00"
}
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_01_2.jpg  "127.0.0.1:8000/asset/575db2e474109f982ead09e7f8676680a679c9c0?token=573944500&ext=jpg&createtime=2003-11-01T16:00:00Z" | python -m json.tool
{
    "Date": "2003-11-01T16:00:00Z",
    "Device": "iphonex",
    "Hash": "575db2e474109f982ead09e7f8676680a679c9c0",
    "Name": "3.jpg",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00"
}
```
If asset has been uploaded before, new upload will be rejected with 409 Conflict
```
$ curl -s -i -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_23.jpg  "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=573944500&ext=jpg&createtime=2003-11-23T12:00:00Z"

HTTP/1.1 100 Continue

HTTP/1.1 409 Conflict
Content-Type: text/plain; charset=utf-8
X-Content-Type-Options: nosniff
Date: Sun, 29 Apr 2018 01:33:45 GMT
Content-Length: 12

{
    "Date": "2003-11-23T12:00:00Z",
    "Device": "iphonex",
    "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
    "Name": "1.jpg",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00"
}
```
## Upload Resume
Mobile upload often aborted for various reason. So lomod support resume upload. The basic workflow is

1. client call `HEAD /asset/<SHA1>` method to discover last uploaded size. Based on last upload status, lomod will return

    - 200 OK: if the asset has been uploaded and created successfully
    - 404 Not Found: if the asset is not saved at all
    - 206 Partial content: if the asset is saved partially. Lomod will return current SHA and size. client can compare and determine if need reupload from scratch or resume upload

2. client call `PATCH /asset/<SHA1>` method with If_Match HTTP header to tell lomod new uploaded content is to resume last upload

    - if If_Match data is different from current saved assets, lomod will return 400 Bad request; otherwise, it resumes last upload

3. after all upload, lomod will compute new SHA again, and decide if the upload is success or not

4. in case upload abort again, since current upload starts writing from last saved place, so as long as client repeats from step 1, everything should be same.

```
$ curl -v -I HEAD "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637"
* Rebuilt URL to: HEAD/
* Could not resolve host: HEAD
* Closing connection 0
curl: (6) Could not resolve host: HEAD
*   Trying 127.0.0.1...
* TCP_NODELAY set
* Connected to 127.0.0.1 (127.0.0.1) port 8000 (#1)
> HEAD /asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637 HTTP/1.1
> Host: 127.0.0.1:8000
> User-Agent: curl/7.54.0
> Content-Type: */*
>
< HTTP/1.1 404 Not Found
HTTP/1.1 404 Not Found
< Date: Sun, 16 Jun 2019 05:52:29 GMT
Date: Sun, 16 Jun 2019 05:52:29 GMT

$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @../test/img/true_2003_11_23.jpg.part1  "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637&ext=jpg&createtime=2003-11-23T12:00:00Z" | python -m json.tool
{
  "id": "24",
  "text": "Uploaded asset has different hash"
}
$ curl -v -I HEAD "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637"
* Rebuilt URL to: HEAD/
* Could not resolve host: HEAD
* Closing connection 0
curl: (6) Could not resolve host: HEAD
*   Trying 127.0.0.1...
* TCP_NODELAY set
* Connected to 127.0.0.1 (127.0.0.1) port 8000 (#1)
> HEAD /asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637 HTTP/1.1
> Host: 127.0.0.1:8000
> User-Agent: curl/7.54.0
> Content-Type: */*
>
< HTTP/1.1 206 Partial Content
HTTP/1.1 206 Partial Content
< If-Match: size=1000, sha1=631ab5ab5befe28f88ad5c2af28e5def4b477a67
If-Match: size=1000, sha1=631ab5ab5befe28f88ad5c2af28e5def4b477a67
< Date: Sun, 16 Jun 2019 05:53:13 GMT
Date: Sun, 16 Jun 2019 05:53:13 GMT

$ curl -s -X PATCH -H 'If-Match: size=1000, sha1=631ab5ab5befe28f88ad5c2af28e5def4b477a67' -H 'content-type:application/octet-stream' --data-binary @../test/img/true_2003_11_23.jpg.part2 "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637&ext=jpg&createtime=2003-11-23T12:00:00Z" | python -m json.tool
{
    "Date": "2003-11-23T12:00:00Z+00:00",
    "Device": "",
    "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
    "Name": "2.jpg",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00"
}
$ curl -v -I -X HEAD "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637"
Note: Unnecessary use of -X or --request, HEAD is already inferred.
*   Trying 127.0.0.1...
* TCP_NODELAY set
* Connected to 127.0.0.1 (127.0.0.1) port 8000 (#0)
> HEAD /asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=355739637 HTTP/1.1
> Host: 127.0.0.1:8000
> User-Agent: curl/7.54.0
> Content-Type: */*
>
< HTTP/1.1 200 OK
HTTP/1.1 200 OK
< Date: Sat, 15 Jun 2019 07:10:31 GMT
Date: Sat, 15 Jun 2019 07:10:31 GMT

<
* Connection #0 to host 127.0.0.1 left intact
```
## Upload with specified file sha
For videos edited through ios photo application, such as slow motion video, video duration and create time always change for every export, in this case, ios client will write original content sha into MOV metadata track. Lomod will use `QuickTime:ComLomorageOriginhash` as tag name to decode using exiftool, and store it into DB
Thus during upload, client will put real content sha into URL path, and put file SHA value as query string `filesha=xxx` for upload validation check.
```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @../test/video/slow_motion.mov "127.0.0.1:8000/asset/b12fb8a5bb04738efe66f186a45f0388d8fabff1?token=6790
52367&ext=mov&createtime=2013-08-08T08:08:08Z&filesha=a6902dc1b38136afe949a78d7d458d760125c864"
{"Name":"11.mov","Hash":"b12fb8a5bb04738efe66f186a45f0388d8fabff1","Date":"2013-08-08T08:08:08Z","Device":""}
```

## Upload without createtime
For web based upload application, javascript can get file's local create time and last modified time easily, but difficult to know image original create time. Thus client can skip createtime query, and carry modifiedtime query string to hint backend to extract time from EXIF tag firstly.
If exiftool can not get time, backend will use `modifiedtime` value as create time. If client doesn't provide `modifiedtime`, backend will return failure
```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @../test/video/slow_motion.mov "127.0.0.1:8000/asset/b12fb8a5bb04738efe66f186a45f0388d8fabff1?token=6790
52367&ext=mov&modifiedtime=2013-08-08T08:08:08Z"
{"Name":"11.mov","Hash":"b12fb8a5bb04738efe66f186a45f0388d8fabff1","Date":"2013-08-08T08:08:08Z","Device":""}
```

## List Asset
List all assets at certain day. It will list all assets at that day ordered by their Hash. Day hash is calculated by concating all asset hash, such as sha1("575db2e474109f982ead09e7f8676680a679c9c07426655f042e8605385cb413de639373b934b18d")="f1d1acc8ffdac4ebdb80d1ad203b512109dcd1fc".
If the day only has one asset, day hash is calculated from hash of the asset, and they should be different
```
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/11/23?token=573944500" | python -m json.tool
{
    "Assets": [
        {
            "Date": "2003-11-23T12:00:00Z",
            "Device": "iphonex",
            "Status": 0,
            "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
            "Name": "1.jpg"
        }
    ],
    "Day": 23,
    "Hash": "ee8e87bb216aa46de86501f4a4c5a27d00aff155"
}
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/11/1?token=573944500" | python -m json.tool
{
    "Assets": [
        {
            "Date": "2003-11-01T16:00:00Z",
            "Device": "iphonex",
            "Status": 0,
            "Hash": "575db2e474109f982ead09e7f8676680a679c9c0",
            "Name": "3.jpg"
        },
        {
            "Date": "2003-11-01T16:00:00Z",
            "Device": "iphonex",
            "Status": 0,
            "Hash": "7426655f042e8605385cb413de639373b934b18d",
            "Name": "2.jpg"
        }
    ],
    "Day": 1,
    "Hash": "f1d1acc8ffdac4ebdb80d1ad203b512109dcd1fc"
}
```
List all assets in one month. It is ordered by day. Month hash is calculated by concating all day hash, such as sha1("f1d1acc8ffdac4ebdb80d1ad203b512109dcd1fc4ebf54db04f335ff66bfc1fd982be62bf23fc967")="4f7ca4527098f3461621f2555cb86dc28f19d5ca".
```
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/11?token=573944500" | python -m json.tool
{
    "Days": [
        {
            "Assets": [
                {
                    "Date": "2003-11-01T16:00:00Z",
                    "Device": "iphonex",
                    "Status": 0,
                    "Hash": "575db2e474109f982ead09e7f8676680a679c9c0",
                    "Name": "3.jpg"
                },
                {
                    "Date": "2003-11-01T16:00:00Z",
                    "Device": "iphonex",
                    "Status": 0,
                    "Hash": "7426655f042e8605385cb413de639373b934b18d",
                    "Name": "2.jpg"
                }
            ],
            "Day": 1,
            "Hash": "f1d1acc8ffdac4ebdb80d1ad203b512109dcd1fc"
        },
        {
            "Assets": [
                {
                    "Date": "2003-11-23T12:00:00Z",
                    "Device": "iphonex",
                    "Status": 0,
                    "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
                    "Name": "1.jpg"
                }
            ],
            "Day": 24,
            "Hash": "ee8e87bb216aa46de86501f4a4c5a27d00aff155"
        }
    ],
    "Hash": "e632b8eee3e9f6ea533022942d8768d4e1549888",
    "Month": 11
}
```
List all assets in one year. It is ordered by month, then day.
```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_01_17.jpg  "127.0.0.1:8000/asset?token=573944500&ext=jpg&createtime=2003-01-17T20:00:00Z" | python -m json.tool
{
    "Date": "2003-01-17T20:00:00Z",
    "Device": "iphonex",
    "Hash": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
    "Name": "4.jpg"
}
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/1?token=573944500" | python -m json.tool
{
    "Days": [
        {
            "Assets": [
                {
                    "Date": "2003-01-17T20:00:00Z",
                    "Device": "iphonex",
                    "Status": 0,
                    "Hash": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
                    "Name": "4.jpg"
                }
            ],
            "Day": 17,
            "Hash": "fcf8499ca85333832c4302cd3363f328605f731d"
        }
    ],
    "Hash": "a7204f74598f70940349623353cc80cecb28d1c6",
    "Month": 1
}
$ curl -s "127.0.0.1:8000/assets/merkletree/2003?token=573944500" | python -m json.tool
{
    "Hash": "f8ac00b7a696970dd4af275deec103536cfe3e08",
    "Months": [
        {
            "Days": [
                {
                    "Assets": [
                        {
                            "Date": "2003-01-17T20:00:00Z",
                            "Device": "iphonex",
                            "Status": 0,
                            "Hash": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
                            "Name": "4.jpg"
                        }
                    ],
                    "Day": 17,
                    "Hash": "fcf8499ca85333832c4302cd3363f328605f731d"
                }
            ],
            "Hash": "a7204f74598f70940349623353cc80cecb28d1c6",
            "Month": 1
        },
        {
            "Days": [
                {
                    "Assets": [
                        {
                            "Date": "2003-11-01T16:00:00Z",
                            "Device": "iphonex",
                            "Status": 0,
                            "Hash": "575db2e474109f982ead09e7f8676680a679c9c0",
                            "Name": "3.jpg"
                        },
                        {
                            "Date": "2003-11-01T16:00:00Z",
                            "Device": "iphonex",
                            "Status": 0,
                            "Hash": "7426655f042e8605385cb413de639373b934b18d",
                            "Name": "2.jpg"
                        }
                    ],
                    "Day": 1,
                    "Hash": "f1d1acc8ffdac4ebdb80d1ad203b512109dcd1fc"
                },
                {
                    "Assets": [
                        {
                            "Date": "2003-11-23T12:00:00Z",
                            "Device": "iphonex",
                            "Status": 0,
                            "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
                            "Name": "1.jpg"
                        }
                    ],
                    "Day": 24,
                    "Hash": "ee8e87bb216aa46de86501f4a4c5a27d00aff155"
                }
            ],
            "Hash": "e632b8eee3e9f6ea533022942d8768d4e1549888",
            "Month": 11
        }
    ],
    "Year": 2003
}
```
List all assets's hash. It is ordered by year, month, then day. Note below will also upload one video
```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2004_1_21.jpg  "127.0.0.1:8000/asset?token=573944500&ext=jpg&createtime=2004-01-21T09:55:50Z" | python -m json.tool
{
    "Date": "2004-01-21T09:55:50Z",
    "Device": "iphonex",
    "Hash": "d4d8773112f68162949b9578f6e476c7f6c8af1f",
    "Name": "5.jpg"
}
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/video/true_2013_08_08.mp4  "127.0.0.1:8000/asset?token=573944500&ext=mp4&createtime=2013-08-08T08:08:08Z" | python -m json.tool
{
    "Date": "2013-08-08T08:08:08Z",
    "Device": "iphonex",
    "Hash": "5d14e3ce82d2101b3b8ece22487d81d824a5745a",
    "Name": "6.mp4"
}
$ curl -s "127.0.0.1:8000/assets/merkletree?token=573944500" | python -m json.tool
{
    "Hash": "a40246ccbd83a84801669db7b92d804aa917625b",
    "Years": [
        {
            "Hash": "f8ac00b7a696970dd4af275deec103536cfe3e08",
            "Months": [
                {
                    "Days": [],
                    "Hash": "a7204f74598f70940349623353cc80cecb28d1c6",
                    "Month": 1
                },
                {
                    "Days": [],
                    "Hash": "e632b8eee3e9f6ea533022942d8768d4e1549888",
                    "Month": 11
                }
            ],
            "Year": 2003
        },
        {
            "Hash": "bc422a424386a23db308d2f9f5862e48e3f330c2",
            "Months": [
                {
                    "Days": [],
                    "Hash": "05053e9a54a21370f45e7b30427f5183ea8547c8",
                    "Month": 1
                }
            ],
            "Year": 2004
        },
        {
            "Hash": "684ac542f3cfad80673cc57147faa5b09d05cf6e",
            "Months": [
                {
                    "Days": [],
                    "Hash": "80e6dfab29ed25343c6dc5d9f0c2225b22ce329d",
                    "Month": 1
                }
            ],
            "Year": 2013
        }
    ]
}

```
## Get Asset
Get asset with asset ID and extension
```
$ curl -s -o 1.jpg "127.0.0.1:8000/asset/1.jpg?token=573944500"
```
Get asset metadata with asset ID and extension. Note that if latitude or longetitude is not detected, its value will be 888
```
$ curl -s "127.0.0.1:8000/asset/metadata/1.jpg?token=573944500" | python -m json.tool
{
    "Date": "2003-11-23T12:00:00Z",
    "Device": "iphonex",
    "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
    "Name": "1.jpg",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00"
}
```
For image asset, client can also specify desired image codec, and lomod will transcode the image on the fly, and save it into preview directory in case it will be requested again.
Right now, only jpg format is supported
```
$ curl -s "127.0.0.1:8000/asset/1.heic?token=573944500&icodec=jpg"
```

For video asset, it downloads down-scaled video by default.
```
$ curl -s "127.0.0.1:8000/asset/6.mp4?token=573944500"
```
If given `orig=1` in query string, backend will reply the original video
```
$ curl -s "127.0.0.1:8000/asset/6.mp4?token=573944500&orig=1"
```
if down-scaled video is not created at download stage, it will return original video

Note that client can also get asset metadata with its hash value
```
$ curl -s "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=573944500"
```
## Delete Asset
Delete asset with asset ID
```
$ curl -s -X DELETE "127.0.0.1:8000/asset/1.jpg?token=573944500"
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/11/23?token=573944500" | python -m json.tool
{
    "Name": []
}
```
Can also delete asset with asset hash
```
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/1/17?token=573944500" | python -m json.tool
{
    "Assets": [
        {
            "Date": "2003-01-17T20:00:00Z+00:00",
            "Device": "iphonex-a",
            "Hash": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
            "Name": "4.jpg"
        }
    ],
    "Day": 17,
    "Hash": "fcf8499ca85333832c4302cd3363f328605f731d"
}
$ curl -s -X DELETE "127.0.0.1:8000/asset/17363532de7bc73e42823c1448bd52ffe45d4bfc?token=573944500&byhash=1"
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/1/17?token=573944500" | python -m json.tool
{
    "Assets": [],
    "Day": 17,
    "Hash": ""
}

```
Can also delete multiple assets by json. Note that if one asset delete failure, error message will be part of reply body, but not impact other assets
| Type  | Description |
| ----- | ----------- |
| 0     | Asset ID is by index |
| 1     | Asset ID is by hash  |

```
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/11/23?token=573944500" | python -m json.tool
{
    "Assets": [
        {
            "Date": "2003-11-23T12:00:00Z+00:00",
            "Device": "iphonex-a",
            "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
            "Name": "1.jpg"
        }
    ],
    "Day": 23,
    "Hash": "ee8e87bb216aa46de86501f4a4c5a27d00aff155"
}
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/1/17?token=573944500" | python -m json.tool
{
    "Assets": [
        {
            "Date": "2003-01-17T20:00:00Z+00:00",
            "Device": "iphonex-a",
            "Hash": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
            "Name": "4.jpg"
        }
    ],
    "Day": 17,
    "Hash": "fcf8499ca85333832c4302cd3363f328605f731d"
}
$ cat test/sample_delete.json
{
    "List": [
        {
            "ID": "1.jpg",
            "Type": 0
        },
        {
            "ID": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
            "Type": 1
        },
        {
            "ID": "10000.jpg",
            "Type": 0
        }
    ]
}
$ curl -s -X DELETE -H "Content-Type: application/json" --data-binary @./test/sample_delete.json "127.0.0.1:8000/asset?token=573944500" | python -m json.tool
{
    "List": [
        {
            "ID": "1.jpg",
            "Reason": "",
            "Result": true,
            "Type": 0
        },
        {
            "ID": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
            "Reason": "",
            "Result": true,
            "Type": 1
        },
        {
            "ID": "1000.jpg",
            "Reason": "sql: no rows in result set",
            "Result": false,
            "Type": 0
        }
    ]
}
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/11/23?token=573944500" | python -m json.tool
{
    "Assets": [],
    "Day": 23,
    "Hash": ""
}
$ curl -s "127.0.0.1:8000/assets/merkletree/2003/1/17?token=573944500" | python -m json.tool
{
    "Assets": [],
    "Day": 17,
    "Hash": ""
}
```
By default, assets will be moved to trashbox, client can add query string `force=1` to delete it directly or add `"Force": true` attribute in request
```
$ curl -s -X DELETE "127.0.0.1:8000/asset/1.jpg?token=573944500&force=1"
$ cat test/sample_delete.json
{
    "List": [
        {
            "ID": "1.jpg",
            "Force": true,
            "Type": 0
        }
    ]
}
$ curl -s -X DELETE -H "Content-Type: application/json" --data-binary @./test/sample_delete.json "127.0.0.1:8000/asset?token=573944500" | python -m json.tool
```
## Update Asset create time
Client can always update asset create time. For example, if asset need change create time to 2021-2-1, client will use `PUT` method with the asset's SHA as well as new date
```
$ curl -s -X PUT "127.0.0.1:8000/asset/17363532de7bc73e42823c1448bd52ffe45d4bfc/2021/2/1?token=573944500"
```
Before update
```
/tmp/usbdisk1/alice/Photos/
|-- [       4096]  master
|   `-- [       4096]  2003
|       `-- [       4096]  11
|           `-- [       4096]  23
|               |-- [      80603]  20031123_1.jpg
|               `-- [    1051433]  20031123_2.heic
`-- [       4096]  preview
    `-- [       4096]  2003
        `-- [       4096]  11
            `-- [       4096]  23
                |-- [      34861]  20031123_1_480_320.jpg
                |-- [       3352]  20031123_1_75_75.jpg
                |-- [      21795]  20031123_2_480_320.jpg
                `-- [       2957]  20031123_2_75_75.jpg

8 directories, 6 files
```
After update
```
/tmp/usbdisk1/alice/Photos/
|-- [       4096]  master
|   |-- [       4096]  2003
|   |   `-- [       4096]  11
|   |       `-- [       4096]  23
|   |           `-- [    1051433]  20031123_2.heic
|   `-- [       4096]  2021
|       `-- [       4096]  02
|           `-- [       4096]  01
|               `-- [      80603]  20210201_1.jpg
`-- [       4096]  preview
    |-- [       4096]  2003
    |   `-- [       4096]  11
    |       `-- [       4096]  23
    |           |-- [      21795]  20031123_2_480_320.jpg
    |           `-- [       2957]  20031123_2_75_75.jpg
    `-- [       4096]  2021
        `-- [       4096]  02
            `-- [       4096]  01
                |-- [      34861]  20210201_1_480_320.jpg
                `-- [       3352]  20210201_1_75_75.jpg

14 directories, 6 files
```
## Preview Management
Once an asset is uploaded, thumbnail will be created automatically. You can retrieve it with preview URL
```
$ curl -s -o 1_preview.jpg "127.0.0.1:8000/asset/preview/1.jpg?token=573944500"
```
You can also specify width and height to generate desired resolution on the fly
```
$ curl -s -o 1_preview_320x240.jpg "127.0.0.1:8000/asset/preview/1.jpg?token=573944500&width=320&height=240"
```

You can also specify codec to generate desired image format.
```
$ curl -s -o 1_preview_320x240.jpg "127.0.0.1:8000/asset/preview/1.jpg?token=573944500&icodec=webp"
```

video preview is also created with image too. People can use asset API to download lower resolution video.
```
$ curl -s -o 6_preview.jpg "127.0.0.1:8000/asset/preview/6.mp4?token=573944500"
```

Once the asset is deleted, its preview is also deleted.

## LivePhoto Management
Live photo is allowed to be uploaded. All live phone need to be uploaded with a single zip file. Live photo's SHA = sha1(sha1(image)+sha1(video)). Image and video will be packaged into the zip file.
For example, if image's SHA1 is 17363532de7bc73e42823c1448bd52ffe45d4bfc and video's SHA1 is 5d14e3ce82d2101b3b8ece22487d81d824a5745a, then live photo's sha = sha1('17363532de7bc73e42823c1448bd52ffe45d4bfc5d14e3ce82d2101b3b8ece22487d81d824a5745a') = adf6b68f7e71912a4e2666533d4c8619f1b9ddb1

When uploading livephot zip, extension should be zip (It was liph, which stands for LIve PHoto. now deprecated) like below
```
$ ls -l
total 472
-rw-r--r--  1 qiwa  staff  231623 Aug 11 23:45 1.jpg
-rw-r--r--@ 1 qiwa  staff    7360 Aug 11 23:45 1.mov
$ zip 1.zip 1.jpg 1.mov
$ ls -l
total 952
-rw-r--r--  1 qiwa  staff  231623 Aug 11 23:45 1.jpg
-rw-r--r--@ 1 qiwa  staff    7360 Aug 11 23:45 1.mov
-rw-r--r--  1 qiwa  staff  242688 Aug 12 23:22 1.zip
$ curl -s -i -X POST -H 'content-type:application/octet-stream' --data-binary @./1.zip "127.0.0.1:8000/asset/adf6b68f7e71912a4e2666533d4c8619f1b9ddb1?token=573944500&ext=zip&createtime=2003-11-23T12:00:00Z" | python -m json.tool
{
    "Name":"1.zip",
    "Hash":"adf6b68f7e71912a4e2666533d4c8619f1b9ddb1",
    "Date":"2003-11-23T12:00:00Z",
    "Device":"iphonex"
}
```
After upload, live photo can also be downloaded as before
```
$ curl -s -o /tmp/test.zip "127.0.0.1:8000/asset/1.zip?token=573944500"
$ unzip /tmp/test.zip
```

Preview will be generated based on static image, and can be retrieved like below
```
$ curl -s -o 1_preview.jpg "127.0.0.1:8000/asset/preview/1.zip?token=573944500"
```

Delete is same as before. Both assets and preview will be deleted

## Asset Status
When getting asset detail infomation through merkle tree, backend will return one integer value of asset status, which uses bit-wise feature to specify different features of the asset

| Bit position | Description |
| ------------ | ----------- |
| 1            | The asset is soft link to original import  |
| 2            | The asset is hidden or not|
| 3            | The asset is public visible or not|
| 4            | The asset is favorite or not.|


| Examples | Description |
| -------- | ----------- |
| 0        | The asset is not soft linked to any files, and neither hidden, nor public, nor favorite  |
| 1        | The asset is soft linked to one file which is specified in album. |
| 2        | The asset is not soft linked to any files, and user sets it hidden |
| 4        | The asset is not soft linked to any files, and user sets it public visible |
| 8        | The asset is not soft linked to any files, and user sets it favorite |
| 12       | The asset is not soft linked to any files, and user sets it favorite, and public visible |
| 13       | The asset is soft linked to one file, and user sets it favorite, public visible |

## Favorite
Client can set multiple assets favorite with this API
```
$ cat ./assetIDs.txt
["1", "2", "3"]
$ curl -s -X POST -H 'content-type:application/json' --data-binary @./assetIDs.txt "127.0.0.1:8000/assets/favorite?token=573944500"
```

Client can also remove favorites attributes for multiple assets
```
$ cat ./assetIDs.txt
["1", "2", "3"]
$ curl -s -X DELETE -H 'content-type:application/json' --data-binary @./assetIDs.txt "127.0.0.1:8000/assets/favorite?token=573944500"
```

## Hide
Client can set multiple assets hide with this API
```
$ cat ./assetIDs.txt
["1", "2", "3"]
$ curl -s -X POST -H 'content-type:application/json' --data-binary @./assetIDs.txt "127.0.0.1:8000/assets/hide?token=573944500"
```

Client can also remove hide attributes for multiple assets
```
$ cat ./assetIDs.txt
["1", "2", "3"]
$ curl -s -X DELETE -H 'content-type:application/json' --data-binary @./assetIDs.txt "127.0.0.1:8000/assets/hide?token=573944500"
```

## Error cases
### Device is not mount
It is possible that device is not mount during asset CRUD. Lomod will return below possible error codes

| Error Code  | HTTP Code | Description |
| ----------- | --------- | ----------- |
| 14          | 500       | Device is not mounted yet  |
| 36          | 500       | Invalid Disk Mount |

# Asset Metadata Management
- All metadata names are given by client, but need be alpha-number, ".", "-", "_".
- Key can be any value.
- During query, all value string need have url encoding format
- During query, key is matched by substring, which is sql `like %key%`

Known geo related metadata names:
- ios.geo.country.en_US
- ios.geo.state.en_US
- ios.geo.city.en_US
- ios.geo.street.en_US: street name
- ios.geo.zipcode.en_US
- ios.geo.mail.en_US: complete mail address for the GPS
- ios.geo.place.en_US: point of interest
Refer https://bitbucket.org/lomoware/lomo-backend/wiki/geo-location-notes for more detail on Geo handler

Places will be auto-created one album and will have one central GPS associated
- ios.geo.country.en_US
- ios.geo.state.en_US
- ios.geo.city.en_US
- ios.geo.street.en_US
- ios.geo.place.en_US

## Pagination
- Limit is hard coded to 100 at backend.
- Metadata task API does not support pagination.
- Asset listing supports pagination.
- Both API have `X-Total-Count: 2` to hint client total count of assets for this query

## Upload with specified metadata during import asset
NOTE: this part is not supported now. Need delete after more discussion
Client can specify metadata during import with the format `meta=<key>,<value>`. `,` is delimiter for key and value. If multiple medata need specify, each one with its own metadata query key. Unicode string need use  each 3-byte encoded query string format
```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @../test/video/slow_motion.mov "127.0.0.1:8000/asset/b12fb8a5bb04738efe66f186a45f0388d8fabff1?token=6790
52367&ext=mov&modifiedtime=2013-08-08T08:08:08Z&meta=n1,v1&meta=n2%2C%E4%BD%A0%E5%A5%BD"
{"Name":"11.mov","Hash":"b12fb8a5bb04738efe66f186a45f0388d8fabff1","Date":"2013-08-08T08:08:08Z","Device":""}
$ curl -s "127.0.0.1:8000/asset/metadata/11.mov?token=679052367" | python -m json.tool
{
    "Date": "2013-08-08T08:08:08Z",
    "Device": "iphonex",
    "Hash": "b12fb8a5bb04738efe66f186a45f0388d8fabff1",
    "Name": "11.mov",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00",
    "Metadatas": [
       {
          "Name":"n1",
          "Value":"v1",
          "CreateTime":"2020-02-09T18:29:21Z",
          "LastModifiedTime":"2020-02-09T18:29:21Z"
       },
       {
          "Name":"n2",
          "Value":"你好",
          "CreateTime":"2020-02-09T18:29:21Z",
          "LastModifiedTime":"2020-02-09T18:29:21Z"
       }
    ]
}

```
## Add new metadata
After import, client can always add new metadata with json string
```
$ cat metadata.json
[
    {
      "Category": "geo",
      "SourceDevice": "android",
      "AssetID": 1,
      "Name": "city",
      "Value": "san jose",
      "Model": "tensorflow",
      "Version": 1
    },
    {
      "Category": "geo",
      "SourceDevice": "ios",
      "AssetID": 2,
      "Name": "city",
      "Value": "sfo",
      "Model": "tensorflow",
      "Version": 1
    }
]
$ curl -s -X POST --data-binary @./metadata.json "127.0.0.1:8000/assets/metadata?token=679052367"
```
Note that if client ensure metadata value is empty, it need use `force=1` query string to force set the value, otherwise, backend will ignore the add or update operation for this key.
```
$ cat metadata.json
[
    {
      "Category": "geo",
      "SourceDevice": "android",
      "AssetID": 1,
      "Name": "city",
      "Value": "",
      "Model": "tensorflow",
      "Version": 1
    }
]
$ curl -s -X POST --data-binary @./metadata.json "127.0.0.1:8000/assets/metadata?force=1&&token=679052367"
```

## Update metadata
After metadata is added, client can also update metadata using same API. In the backend, the unique key is <Category, SourceDevice, AssetID, Name>, if version is different, backend will udpate

## List available categories/name/values in the backend
Client can query and list all available categories in the backend
```
$ curl -s "127.0.0.1:8000/assets/metadata/category?token=$token" | python -m json.tool
{
      "Categories": [
              "geo",
              "face"
      ]
}
```
Client can also list all available names under one categories in the backend
```
$ curl -s "127.0.0.1:8000/assets/metadata/geo/names?token=$token" | python -m json.tool
{
      "CategoryNames": {
               "geo": [
                       "city",
                       "poi"
               ]
      }
}
```
Client can also list all available values under name of one categories in the backend
```
$ curl -s "127.0.0.1:8000/assets/metadata/geo/city/values?token=$token" | python -m json.tool
{
      "CategoryValues": [
              "geo": {
                "city": [
                  "san jose",
                  "sfo"
                ]
              }
      ]
}
```
If metadata name is belong to one of album geo location, it will also be inserted into one place database. Client need help get its central longitude and latitude. Refer below section for API 

## Get assets whose metadata are not processed, or outdated
List all assets not having any name/value under geo category @ ios. User can specify number of assets to return. By default, it is 100. 
```
$ curl -s "127.0.0.1:8000/assets/metadata?token=$token&limit=200&source-device=ios&miss-category=geo" | python -m json.tool
[
  1,
  2
]
```
List all assets whose metadata version is less than one given version under geo category @ ios
```
$ curl -s "127.0.0.1:8000/assets/metadata?token=$token&source-device=ios&category=geo&ver-less=2" | python -m json.tool
[
  1,
  2
]
```
List all assets not having one metadata name under geo category @ ios
```
$ curl -s "127.0.0.1:8000/assets/metadata?token=$token&source-device=ios&category=geo&miss-name=city" | python -m json.tool
[
  1,
  2
]
```
List all assets whose metadata version is less than one version, and having one metadata name uner geo category @ ios
```
$ curl -s "127.0.0.1:8000/assets/metadata?token=$token&source-device=ios&category=geo&name=city&ver-less=2" | python -m json.tool
[
  1,
  2
]
```
## List assets having given name / value
After updating metadatas, client can also list assets having given name and value. Note that value need to be url encoding
```
$ curl -s "127.0.0.1:8000/assets?token=$token&meta-nv=city,san%20jose" | python -m json.tool
[
  1,
  2
]
```
Pagination is supported for this API. Client can add `page=1` and `limit=200` in the query string. Default limit is 100
```
$ curl -s "127.0.0.1:8000/assets?token=$token&page=1&limit=200&meta-nv=city,san%20jose" | python -m json.tool
[
  1,
  2
]
```
## List assets matching given value
Client can also list assets matching only value. Delimiter `,` is still needed to hint backend query condition is value.
Note that this may cause query slow dramatically, need use carefully
```
$ curl -s "127.0.0.1:8000/assets?token=$token&meta-nv=,san%20jose" | python -m json.tool
[
  1,
  2
]
```
Pagination is also supported for this API. Client can add `page=1` and `limit=200` in the query string. Default limit is 100
```
$ curl -s "127.0.0.1:8000/assets?token=$token&page=1&limit=200&meta-nv=city,san%20jose" | python -m json.tool
[
  1,
  2
]
```
## Get One Asset's Metadataa
Client can read asset's metadata anytime they want. If asset's GEO data is not loaded before, backend will read and update DB
```
$ curl -s "127.0.0.1:8000/asset/metadata/1?token=$token" | python -m json.tool
{
    "Date": "2013-08-08T08:08:08Z",
    "Device": "iphonex",
    "Hash": "b12fb8a5bb04738efe66f186a45f0388d8fabff1",
    "Name": "11.mov",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00",
    "Metadatas": [
       {
          "Name":"n1",
          "Value":"v1",
          "CreateTime":"2020-02-09T18:29:21Z",
          "LastModifiedTime":"2020-02-09T18:29:21Z"
       },
       {
          "Name":"n2",
          "Value":"你好",
          "CreateTime":"2020-02-09T18:29:21Z",
          "LastModifiedTime":"2020-02-09T18:29:21Z"
       }
    ]
}
```
Client can also pass hash instead of asset ID, backend will detect and process accordingly
```
$ curl -s "127.0.0.1:8000/asset/metadata/b12fb8a5bb04738efe66f186a45f0388d8fabff1?token=$token" | python -m json.tool
{
    "Date": "2013-08-08T08:08:08Z",
    "Device": "iphonex",
    "Hash": "b12fb8a5bb04738efe66f186a45f0388d8fabff1",
    "Name": "11.mov",
    "Latitude": "1.1112332",
    "Longtitude": "-111.00",
    "Metadatas": [
       {
          "Name":"n1",
          "Value":"v1",
          "CreateTime":"2020-02-09T18:29:21Z",
          "LastModifiedTime":"2020-02-09T18:29:21Z"
       },
       {
          "Name":"n2",
          "Value":"你好",
          "CreateTime":"2020-02-09T18:29:21Z",
          "LastModifiedTime":"2020-02-09T18:29:21Z"
       }
    ]
}
```
## Get List of Assets' Metadataa
Client can specify list of asset IDs and get their corresponding metadata
```
$ cat ./test/sample_asset_ids.json
[1,3,5,7]
$ curl -s -X POST --data-binary @./test/sample_asset_ids.json "127.0.0.1:8000/assets/metadata/byid?token=362648029" | python -m json.tool
[
    {
      "Name": "1.jpg",
      "Hash": "69a65215eea4def69e1cfd3fbf4295ebd2dfa714",
      "Device": "iphonex",
      "Status": 0,
      "Longitude": 0.11,
      "Latitude": 0.11,
      "Date": "2023-02-26T06:11:54Z",
      "Metadatas": [
        {
          "Category": "tag",
          "SourceDevice": "android",
          "AssetID": 1,
          "Name": "city.1",
          "Value": "san jose",
          "Model": "tensorflow",
          "Version": 1,
          "CreateTime": "2023-02-26T06:11:54Z",
          "LastModifiedTime": "2023-02-26T06:11:54Z"
        }
      ]
    },
    {
      "Name": "3.mp4",
      "Hash": "b12fb8a5bb04738efe66f186a45f0388d8fabff1",
      "Device": "iphonex",
      "Status": 0,
      "Longitude": 0.11,
      "Latitude": 0.11,
      "Date": "2023-02-26T06:11:54Z",
      "Metadatas": [
        {
          "Category": "tag",
          "SourceDevice": "ios",
          "AssetID": 3,
          "Name": "POI-2",
          "Value": "museum",
          "Model": "tensorflow",
          "Version": 2,
          "CreateTime": "2023-02-26T06:11:54Z",
          "LastModifiedTime": "2023-02-26T06:11:54Z"
        },
        {
          "Category": "tag",
          "SourceDevice": "ios",
          "AssetID": 3,
          "Name": "city.1",
          "Value": "sfo",
          "Model": "tensorflow",
          "Version": 1,
          "CreateTime": "2023-02-26T06:11:54Z",
          "LastModifiedTime": "2023-02-26T06:11:54Z"
        }
      ]
    },
    {
      "Name": "5.jpg",
      "Hash": "17363532de7bc73e42823c1448bd52ffe45d4bfc",
      "Device": "iphonex",
      "Status": 0,
      "Longitude": 0.11,
      "Latitude": 0.11,
      "Date": "2023-02-26T06:11:54Z",
      "Metadatas": [
        {
          "Category": "tag",
          "SourceDevice": "ios",
          "AssetID": 5,
          "Name": "POI-2",
          "Value": "动物园",
          "Model": "tensorflow",
          "Version": 1,
          "CreateTime": "2023-02-26T06:11:54Z",
          "LastModifiedTime": "2023-02-26T06:11:54Z"
        },
        {
          "Category": "tag",
          "SourceDevice": "android",
          "AssetID": 5,
          "Name": "city.1",
          "Value": "san jose",
          "Model": "tensorflow",
          "Version": 1,
          "CreateTime": "2023-02-26T06:11:54Z",
          "LastModifiedTime": "2023-02-26T06:11:54Z"
        }
      ]
    },
    {
      "Name": "7.jpg",
      "Hash": "491154fee1b01c2e41fb93dc41843f5e77c1732b",
      "Device": "iphonex",
      "Status": 0,
      "Longitude": 0.11,
      "Latitude": 0.11,
      "Date": "2023-02-26T06:11:54Z",
      "Metadatas": [
        {
          "Category": "face",
          "SourceDevice": "android",
          "AssetID": 7,
          "Name": "People_3",
          "Value": "alice",
          "Model": "tensorflow",
          "Version": 1,
          "CreateTime": "2023-02-26T06:11:54Z",
          "LastModifiedTime": "2023-02-26T06:11:54Z"
        }
      ]
    }
  ]
```
## Get places whose central longitude and latitude is not updated
List all places not having central longtitude and latitude. Backend will reply the ones not updated successfully. Level ID is defined at https://bitbucket.org/lomoware/lomo-backend/wiki/geo-location-notes
```
$ curl -s "127.0.0.1:8000/assets/metadata/places?token=362648029" | python -m json.tool
[
    {
      "ID": 1,
      "Level": 1,
      "Lang": "en_US",
      "Country": "United States",
      "Longitude": 0,
      "Latitude": 0
    },
    {
      "ID": 2,
      "Level": 2,
      "Lang": "en_US",
      "Country": "United States",
      "State": "CA",
      "Longitude": 0,
      "Latitude": 0
    },
    {
      "ID": 3,
      "Level": 4,
      "Lang": "en_US",
      "Country": "United States",
      "State": "CA",
      "City": "San Jose",
      "Longitude": 0,
      "Latitude": 0
    }
  ]
```

User can upload longitude and latitude for each place as below. Place ID is the unique identifier to associated the place in the backend
```
$ curl -s -X PUT -d '{"Longitude":12.0,"Latitude":-118.0}' -H "Content-Type: application/json" "127.0.0.1:8000/assets/metadata/places/1?token=362648029"
$ curl -s -X PUT -d '{"Longitude":11.0,"Latitude":-119.0}' -H "Content-Type: application/json" "127.0.0.1:8000/assets/metadata/places/2?token=362648029"
$ curl -s -X PUT -d '{"Longitude":10.0988,"Latitude":-120.00099}' -H "Content-Type: application/json" "127.0.0.1:8000/assets/metadata/places/3?token=362648029"
```

After upload, list API should return empty array now
```
$ curl -s "127.0.0.1:8000/assets/metadata/places?token=362648029" | python -m json.tool
[]
```

# Scan and Import existing photos / videos
## Scan assets
After client triggers scan command, Lomod will automatically scan all folders under specified mount directory.
```
$ curl -s -X POST "127.0.0.1:8000/assets/scan?token=1234567"
```
Client can query scan result, if it is not finished, it will reply 503 status code and error message
```
$ curl -s "127.0.0.1:8000/assets/scan?token=1234567"
{"id": "33", "text": "Scan in progress"}
```

If scan had error, error message will reply, such as
```
$ curl -s "127.0.0.1:8000/assets/scan?token=1234567"
{"id": "0", "text": "Device is not readable"}
```
If scan was success, it will reply the scan tree result in json format
```
$ curl -s "127.0.0.1:8000/assets/scan?token=1234567"
{
 "Name": "/tmp/usbdisk1",
 "Flag": 1,
 "Children": [
  {
   "Name": "scan_test",
   "Flag": 1,
   "Children": [
    {
     "Name": "video",
     "Flag": 3,
     "Children": [
      {
       "Name": "lomo_orig_sha.mov",
       "Flag": 128,
       "SHA1": "69a65215eea4def69e1cfd3fbf4295ebd2dfa714",
       "CreateTime": "2020-05-21T05:42:37Z"
      },
      {
       "Name": "sample.3gp",
       "Flag": 128,
       "SHA1": "491154fee1b01c2e41fb93dc41843f5e77c1732b",
       "CreateTime": "2020-04-18T21:50:35Z"
      },
      {
       "Name": "true_2013_08_08.mp4",
       "Flag": 132,
       "SHA1": "5d14e3ce82d2101b3b8ece22487d81d824a5745a",
       "CreateTime": "2013-08-08T08:08:08Z"
      }
     ],
     "CreateTime": "2021-01-03T01:37:29Z",
     "EarliestTime": "2013-08-08T08:08:08Z",
     "LatestTime": "2021-01-03T01:37:29Z"
    },
    {
     "Name": "图片",
     "Flag": 3,
     "Children": [
      {
       "Name": "1.webp",
       "Flag": 128,
       "SHA1": "0c03dcd19f804a559bd0ae32db2998dad4a4936a",
       "CreateTime": "2021-01-01T06:21:08Z"
      },
      {
       "Name": "img_4479.heic",
       "Flag": 132,
       "SHA1": "2a8210982e4cfbeb56d283f43fea9c118a53a839",
       "CreateTime": "2017-09-13T06:27:17Z"
      },
      {
       "Name": "sample1.dng",
       "Flag": 132,
       "SHA1": "893326e969385849d88176538650f181cd350e52",
       "CreateTime": "2008-12-14T15:54:54Z"
      },
      {
       "Name": "true_2004_1_21.jpg",
       "Flag": 132,
       "SHA1": "d4d8773112f68162949b9578f6e476c7f6c8af1f",
       "CreateTime": "2004-01-21T01:55:50Z"
      },
      {
       "Name": "true_2018_07_28.png",
       "Flag": 128,
       "SHA1": "921196cc106f070668dbb2ff3eafc01017540a52",
       "CreateTime": "2020-01-15T03:49:36Z"
      }
     ],
     "CreateTime": "2021-01-03T06:50:36Z",
     "EarliestTime": "2003-01-17T12:00:00Z",
     "LatestTime": "2021-01-03T06:50:36Z"
    }
   ],
   "CreateTime": "2021-01-03T06:21:08Z",
   "EarliestTime": "2003-01-17T12:00:00Z",
   "LatestTime": "2021-01-03T06:50:36Z"
  }
 ],
 "CreateTime": "2021-01-03T06:21:08Z",
 "EarliestTime": "2003-01-17T12:00:00Z",
 "LatestTime": "2021-01-03T06:50:36Z"
}
```
Flag is bitwise with below value

| Value  | Description |
| ------ | ----------- |
| 1 << 0 | It is one directory  |
| 1 << 1 | It is one media file  |
| 1 << 2 | It has exif tag  |
| 1 << 3 | reserved |
| 1 << 4 | File size is 0 |
| 1 << 5 | File is malformat  |
| 1 << 6 | Last import is copy  |
| 1 << 7 | Last import is symbol link  |

## Download Scan assets preview
After scan success, client can download preview for user to fast browse. It is same query condition as regular asset preview download. Its path is "/assets/scan/preview/{year}/{month}/{day}/{sha1}.{extension}". Since client only has SHA and create time, client need form URL with all these information.
Client should also set right extension file based on asset name, if asset is video file, client can set extension name ".jpg" to get image only or ".mp4" to get transcoded video. 
Same as other preview download, client can specify width and height for preview dimension. Note that no JITT preview generation, these dimension must be same as the one defined in lomod.
For example, for above scanned image assets,
```
      {
       "Name": "true_2004_1_21.jpg",
       "Flag": 132,
       "SHA1": "d4d8773112f68162949b9578f6e476c7f6c8af1f",
       "CreateTime": "2004-01-21T01:55:50Z"
      },
      {
       "Name": "true_2018_07_28.png",
       "Flag": 128,
       "SHA1": "921196cc106f070668dbb2ff3eafc01017540a52",
       "CreateTime": "2020-01-15T03:49:36Z"
      }

```
Use below URL to download preview image file
```
$ wget "127.0.0.1/assets/scan/preview/2004/1/21/d4d8773112f68162949b9578f6e476c7f6c8af1f.jpg?token=1234567&width=75&height=75"
$ wget "127.0.0.1/assets/scan/preview/2004/1/15/921196cc106f070668dbb2ff3eafc01017540a52.png?token=1234567&width=75&height=75"
```
And for above scanned video asset,
```
      {
       "Name": "true_2013_08_08.mp4",
       "Flag": 132,
       "SHA1": "5d14e3ce82d2101b3b8ece22487d81d824a5745a",
       "CreateTime": "2013-08-08T08:08:08Z"
      },
```
Use below URL to download preview image file
```
$ wget "127.0.0.1/assets/scan/preview/2013/8/8/5d14e3ce82d2101b3b8ece22487d81d824a5745a.jpg?token=1234567&width=75&height=75"
```
and use below URL to download preview image file
```
$ wget "127.0.0.1/assets/scan/preview/2013/8/8/5d14e3ce82d2101b3b8ece22487d81d824a5745a.mp4?token=1234567&width=320"
```

## Import Scan assets 
After client decides which path and image to import, it can construct one json file having the same format as scan result. If one directory is given without any media files, it means lomod will import all medias recursively under the directory. If the media files are given under the directly, lomod will only import these files, not other files in the directory.
Import rest path is POST /assets/scan/import/{import_time} to trigger import event. import time format is same as lomodTimeformat. Client should use the {import_time} value to retrieve import result. In case user selected multiple import, the {import-time] can be used to distinguish different import. Also note that if one import is not finished, client should not trigger a new import 
```
$ curl -s -X POST "127.0.0.1/assets/scan/import/2013-08-08T08:08:08Z?token=1234567"
```
By default, import is copied, and won't touch original assets. Client can also specify query string `link=1` to indicate lomod to link original assets instead of copy new one. Even if previous import was done by symbol link, client can still specify this flag, lomod will detect, delete the last symbol link and move assets accordingly, for example,
```
$ curl -s -X POST "127.0.0.1/assets/scan/import?token=1234567&move=1&p=%2Ftmp%2Fusbdisk1%2Fscan_test%2Fvideo"
```


Note that import is also one asynchronuse operation, so client need pull import result. It has the same structure as scan file, but flag will show which one is imported
```
curl -s "127.0.0.1/assets/scan/import?token=1234567"
```

## Scan And Import Scan assets 
To ease people use, one API to allow client to specify one directory, and lomod will scan and import in one step. In this case, specified directory need use escape encoding and put in query string with key `path`. Also one query string `move` can specify the import to move or symbol link the original photos or videos. For example, if original path is `/tmp/usbdisk1/scan_test`, below command will do import
```
$ curl -s -X POST "127.0.0.1:8000/assets/scan?token=1234567&import=1&path=%2Ftmp%2Fusbdisk1%2Fscan_test&move=1"
```
After it, backend will do some sanity check and return immediately. All imports will be done at background, client needs use get status api to know if it finished or not.
During or after import, Client can use below API to get import log
```
$ curl -s "127.0.0.1:8000/assets/scan/log?token=1234567&path=%2Ftmp%2Fusbdisk1%2Fscan_test"
```

# Album Management
## Create Album
`alice` will be the owner of the user. She can add assets into this album. Backend will create one unique ID for each album, and return to client. Client should use the ID for future reference
```
$ cat ./test/sample_album.json
{
    "Title":"favorite",
    "Description":"favorite photos",
    "Author": "alice"
}
$ curl -s -X POST  -H "Content-Type: application/json" --data-binary @./test/sample_album.json "127.0.0.1:8000/album?token=1234567" | python -m json.tool
{
    "Author": "alice",
    "CreateTime": "2020-12-07T02:06:18Z",
    "Description": "favorite photos",
    "ID": 2,
    "LastModifiedTime": "2020-12-07T02:06:18Z",
    "Title": "favorite"
}
```
## Update Album
Client can update album title and description
```
$ cat ./test/sample_album_update.json
{
    "ID": 2,
    "Title":"favorite update",
    "Description":"favorite photos update"
}
$ curl -s -X PUT  -H "Content-Type: application/json" --data-binary @./test/sample_album_update.json "127.0.0.1:8000/album?token=1234567"
$ curl -s 127.0.0.1:8000/album?token=1234567 | python -m json.tool
{
    "Albums": [
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:06:18Z",
            "Description": "favorite photos update",
            "ID": 2,
            "LastModifiedTime": "2020-12-07T02:06:18Z",
            "Title": "favorite update"
        }
    ]
}
{
    "Author": "alice",
    "CreateTime": "2020-12-07T02:06:18Z",
    "Description": "favorite photos",
    "ID": 2,
    "LastModifiedTime": "2020-12-07T02:06:18Z",
    "Title": "favorite"
}
```
## List album
Client can also list all albums
```
$ curl -s 127.0.0.1:8000/album?token=1234567 | python -m json.tool
{
    "Albums": [
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:02:32Z",
            "Description": "family photos",
            "ID": 1,
            "LastModifiedTime": "2020-12-07T02:02:32Z",
            "Title": "family"
        },
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:06:18Z",
            "Description": "favorite photos",
            "ID": 2,
            "LastModifiedTime": "2020-12-07T02:06:18Z",
            "Title": "favorite"
        }
    ]
}
```
## Delete album
Client can delete unused album using its ID
```
$ curl -X DELETE 127.0.0.1:8000/album/1?token=1234567
$ curl -s 127.0.0.1:8000/album?token=1234567 | python -m json.tool
{
    "Albums": [
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:06:18Z",
            "Description": "favorite photos",
            "ID": 2,
            "LastModifiedTime": "2020-12-07T02:06:18Z",
            "Title": "favorite"
        }
    ]
}
```
Client can delete multiple albums using their IDs
```
$ cat ./test/sample_album_ids.csv
[1, 2, 3]
$ curl -s -X DELETE -H "Content-Type: application/json" --data-binary @./test/sample_album_ids.csv "127.0.0.1:8000/album?token=1234567"
```
## Merge albums

Client can merge multiple albums into one. This can be used for merging face albums clustered by face recognition by user.

```
$ cat ./test/sample_merge_albums.json
{
    "Title":"Bob",
    "AlbumIDs":[1, 2, 3]
}
$ curl -s -X POST  -H "Content-Type: application/json" --data-binary @./test/sample_merge_albums.json "127.0.0.1:8000/album/merge?token=1234567"
```

## Add assets into one album
Client can add a list of asset IDs or hash into one album
```
$ cat ./test/sample_album_assets.csv
["1", "2", "921196cc106f070668dbb2ff3eafc01017540a52"]
$ curl -s -X POST  -H "Content-Type: application/json" --data-binary @./test/sample_album_assets.csv "127.0.0.1:8000/album/2/assets?token=1234567"
```
If one of asset ID is not belong to the user or not exist, backend will return error
```
$ curl -s -X POST  -H "Content-Type: text/plain" --data-binary @./test/sample_album_assets.csv "127.0.0.1:8000/album/2/assets?token=1234567"
{"id": "0", "text": "assets [11 9] not exist"}
```

## List total assets in one album
Client can get total assets in one album by using `HEAD` method
```
$ curl -v -I HEAD  "127.0.0.1:8000/album/2/assets?token=1234567"
$ curl -v -I HEAD  "127.0.0.1:8000/album/2/assets?token=1234567"
* Rebuilt URL to: HEAD/
* Could not resolve host: HEAD
* Closing connection 0
curl: (6) Could not resolve host: HEAD
*   Trying 127.0.0.1...
* TCP_NODELAY set
* Connected to 127.0.0.1 (127.0.0.1) port 8000 (#1)
> HEAD /album/2/assets?token=1234567 HTTP/1.1
> Host: 127.0.0.1:8000
> User-Agent: curl/7.58.0
> Accept: */*
>
< HTTP/1.1 200 OK
HTTP/1.1 200 OK
< Content-Length: 0
Content-Length: 0
< X-Total-Count: 3
X-Total-Count: 3
< Date: Mon, 07 Dec 2020 06:42:14 GMT
Date: Mon, 07 Dec 2020 06:42:14 GMT
```
After knowing the total number of assets, client can get asset IDs with their extensions in one album. Paging here is supported
```
$ curl  "127.0.0.1:8000/album/2/assets?token=1234567&page=0&limit=100"
["3.mp4","2.webp","1.jpg"]
```
By default list assets in one album return ID only, client can get both asset ID and asset hash with query parameter `hash=1`
```
$ curl  "127.0.0.1:8000/album/2/assets?token=1234567&hash=1&page=0&limit=100"
[{"Name": "3.jpg", "Hash": "2a8210982e4cfbeb56d283f43fea9c118a53a839"}, {"Name": "2.jpg", "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967"}]
```
## Remove assets from one album
Client can also remove some assets from album by providing asset IDs list
```
$ cat ./test/sample_album_assets.csv
[1]
$ curl -s -X DELETE  -H "Content-Type: application/json" --data-binary @./test/sample_album_assets.csv "127.0.0.1:8000/album/2/assets?token=1234567"
$ curl  "127.0.0.1:8000/album/2/assets?token=1234567&page=0&limit=100"
[3,2]
```
If one of asset ID is not belong to the user or not exist, backend will return status code 400, and body `{"id": "1", "text": "Bad Request"}`
## Get assets not associating with any albums yet
List all assets not associating with any albums yet
```
$ curl -s "127.0.0.1:8000/assets?token=$token&miss-album=1" | python -m json.tool
[{"Name": "3.jpg", "Hash": "2a8210982e4cfbeb56d283f43fea9c118a53a839"}, {"Name": "2.jpg", "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967"}]
```
## List albums belongs to given asset
List all albums belongs to one given assets by its ID or Hash. Assume asset ID 1 has hash "2a8210982e4cfbeb56d283f43fea9c118a53a839"
```
$ curl -s "127.0.0.1:8000/asset/album/1" | python -m json.tool
{
    "Albums": [
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:02:32Z",
            "Description": "family photos",
            "ID": 1,
            "LastModifiedTime": "2020-12-07T02:02:32Z",
            "Title": "family"
        },
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:06:18Z",
            "Description": "favorite photos",
            "ID": 2,
            "LastModifiedTime": "2020-12-07T02:06:18Z",
            "Title": "favorite"
        }
    ]
}
$ curl -s "127.0.0.1:8000/asset/album/2a8210982e4cfbeb56d283f43fea9c118a53a839" | python -m json.tool
{
    "Albums": [
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:02:32Z",
            "Description": "family photos",
            "ID": 1,
            "LastModifiedTime": "2020-12-07T02:02:32Z",
            "Title": "family"
        },
        {
            "Author": "alice",
            "CreateTime": "2020-12-07T02:06:18Z",
            "Description": "favorite photos",
            "ID": 2,
            "LastModifiedTime": "2020-12-07T02:06:18Z",
            "Title": "favorite"
        }
    ]
}
```
# Label Management
Lomo clients will run AI analysis to deterine the scene of each photos and save them as metadata in lomod db. Lomod will further classified the analysis results based on https://bitbucket.org/lomoware/lomo-backend/wiki/Scene%20classification%20notes, and associated each photos with corresponding labels. These labels are auto-created by lomo backend. At the same time, end user can always create their own labels from mobile client, and associate them with the photos. 
## List Labels
Client can list available assets in the backend
```
$ curl -s "127.0.0.1:8000/assets/label?token=573944500" | python -m json.tool
[
    {
        "ID": 1,
        "Label": "acorn",
        "LabelCN": "橡子",
        "AssetsCount": 0
    },
    {
        "ID": 2,
        "Label": "aircraft",
        "LabelCN": "飞行器",
        "AssetsCount": 2
    }
]
```
## List Assets for Given Label
Client can use this API to list all assets for one label
```
$ curl -s "127.0.0.1:8000/assets/label/1?token=573944500" | python -m json.tool
[
    {
       "Name": "1.jpg",
       "Hash": "d4d8773112f68162949b9578f6e476c7f6c8af1f",
       "Confidence": 78.0
    },
    {
       "Name": "2.png",
       "Hash": "921196cc106f070668dbb2ff3eafc01017540a52",
       "Confidence": 100.0
    }
]
```
## List One Asset's Label
Client can use this API to list one asset's all labels. If label is added by user, confidence is 100.0, otherwise, it is calculated based on AI tool
```
$ curl -s "127.0.0.1:8000/asset/label?token=573944500" | python -m json.tool
[
    {
        "ID": 1,
        "Confidence": 78.0
    },
    {
        "ID": 2,
        "Confidence": 100.0
    }
]
```
## Create One Label
Client can use below API to create one new label at backend. Backend will store and return label ID allocated in backend
```
$ cat ./sample_label.json
{
   "Label": "flower",
   "LabelCN": "鲜花"
}
$ curl -s -X POST  -H "Content-Type: application/json" --data-binary @./sample_label.json "127.0.0.1:8000/assets/label?token=1234567"
1
```
## Add Label for Given assets
Client can associate one label for multiple assets. Assume label ID is 1, below API will associate label 1 with asset 1.jpg and asset "xxx"
```
$ cat ./label_assets.txt
["1", "2", "921196cc106f070668dbb2ff3eafc01017540a52"]
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/label_assets.txt "127.0.0.1:8000/assets/label/1?token=573944500"
```
## Remove Label from One asset
```
$ cat ./label_assets.txt
["1", "2", "921196cc106f070668dbb2ff3eafc01017540a52"]
$ curl -s -X DELETE -H "Content-Type: application/json" --data-binary @./test/label_assets.txt "127.0.0.1:8000/assets/label/1?token=573944500"
```

# Group Management
## Create Group
Create group. `alice` will be the owner of the user. She can add other users to this group
```
$ curl -s -X POST  "127.0.0.1:8000/group/family?token=573944500" | python -m json.tool
{
    "ID": 1,
    "Members": [
        {
            "ID": 1,
            "Name": "alice"
        }
    ],
    "Name": "family",
    "OwnerID": 1
}

```
You can also provide a json file to specify members to be added. Note that all members in the json should be pre-created.

```
$ cat sample_group.json
{
  "Name":"favorite",
  "Members":[
    {
      "ID": 4
    }
  ]
}
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/sample_group.json "127.0.0.1:8000/group?token=573944500" | python -m json.tool
{
    "ID": 2,
    "Members": [
        {
            "ID": 4,
            "Name": "denny"
        },
        {
            "ID": 1,
            "Name": "alice"
        }
    ],
    "Name": "favorite",
    "OwnerID": 1
}
```

## List group
```
$ curl -s  "127.0.0.1:8000/group?token=573944500" | python -m json.tool
{
    "Groups": [
        {
            "ID": 1,
            "Members": [
                {
                    "ID": 1,
                    "Name": "alice"
                }
            ],
            "Name": "family",
            "OwnerID": 1
        },
        {
            "ID": 2,
            "Members": [
                {
                    "ID": 4,
                    "Name": "denny"
                },
                {
                    "ID": 1,
                    "Name": "alice"
                }
            ],
            "Name": "favorite",
            "OwnerID": 1
        }
    ]
}
```

Add member into group (user must be created by sql before). Note that people need get list of user id, and user ID as parameter to add. For example, bob's user id is 2, and family group id is 1. So to add bob into family group, url should be `group/1/2`
```
$ curl -s -X POST  "127.0.0.1:8000/group/1/2?token=573944500"
```
List member in one group. Assuming family's group ID is 1
```
$ curl -s  "127.0.0.1:8000/group/1?token=573944500" | python -m json.tool
[
    {
        "ID": 1,
        "Name": "alice"
    },
    {
        "ID": 2,
        "Name": "bob"
    }
]
```
Delete member in one group
```
$ curl -s -X DELETE  "127.0.0.1:8000/group/1/2?token=573944500"
```

# Share Assets
Assuming alice has 2 groups: family and favorite. Family group has 3 users: alice, bob and charlie. favorite group has 2 users: alice and denny. Below section will show how share works.
Also assume bob upload photo 1.jpg, and alice upload photo 2.jpg and 3.jpg

```
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_23.jpg  "127.0.0.1:8000/asset/4ebf54db04f335ff66bfc1fd982be62bf23fc967?token=573944500&ext=jpg&createtime=2003-11-23T12:00:00Z" | python -m json.tool
{
    "Date": "2003-11-23T12:00:00Z",
    "Device": "iphonex",
    "Hash": "4ebf54db04f335ff66bfc1fd982be62bf23fc967",
    "Name": "1.jpg"
}
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_01_1.jpg  "127.0.0.1:8000/asset/7426655f042e8605385cb413de639373b934b18d?token=573944500&ext=jpg&createtime=2003-11-01T16:00:00Z" | python -m json.tool
{
    "Date": "2003-11-01T16:00:00Z",
    "Device": "iphonex",
    "Hash": "7426655f042e8605385cb413de639373b934b18d",
    "Name": "2.jpg"
}
$ curl -s -X POST -H 'content-type:application/octet-stream' --data-binary @./test/img/true_2003_11_01_2.jpg  "127.0.0.1:8000/asset/575db2e474109f982ead09e7f8676680a679c9c0?token=573944500&ext=jpg&createtime=2003-11-01T16:00:00Z" | python -m json.tool
{
    "Date": "2003-11-01T16:00:00Z",
    "Device": "iphonex",
    "Hash": "575db2e474109f982ead09e7f8676680a679c9c0",
    "Name": "3.jpg"
}
```

## Share Assets to one user
Alice share asset 2.jpg and 3.jpg to user `bob` who has user id 2. `Type` means sharing type for the asset

| Type  | Description |
| ----- | ----------- |
| 0     | Asset is shared to one user |
| 1     | Asset is shared to one group  |
| 2     | Asset is casted to one chromecast device  |


```
$ curl -s -X POST  "127.0.0.1:8000/send/user/2/2.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 1,
    "ReadFlag": false,
    "ReceiverID": 2,
    "SenderID": 1,
    "ShareTime": "2018-08-28T08:22:13.694272129-07:00",
    "Type": 0
}

$ curl -s -X POST  "127.0.0.1:8000/send/user/2/3.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "3.jpg",
    "ID": 2,
    "ReadFlag": false,
    "ReceiverID": 2,
    "SenderID": 1,
    "ShareTime": "2018-08-28T08:43:01.333347042-07:00",
    "Type": 0
}

```

If one asset is shared again, the share ID will be same, but share time will be changed to current time
$ curl -s -X POST  "127.0.0.1:8000/send/user/2/3.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "3.jpg",
    "ID": 2,
    "ReadFlag": false,
    "ReceiverID": 2,
    "SenderID": 1,
    "ShareTime": "2018-08-31T08:43:01.333347042-07:00",
    "Type": 0
}

If the user doesn't have the asset, it will get error reply
$ curl -s -X POST  "127.0.0.1:8000/send/user/2/300.jpg?token=573944500" | python -m json.tool
{
    "id": "20",
    "text": "Asset not exist for the user"
}

Alice share asset 2.jpg to user `denny`
```
$ curl -s -X POST  "127.0.0.1:8000/send/user/4/2.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 3,
    "ReadFlag": false,
    "ReceiverID": 4,
    "SenderID": 1,
    "ShareTime": "2018-08-29T08:26:46.383448624-07:00",
    "Type": 0
}
```

## Share Assets to one group
Alice share asset 2.jpg to group `family`
```
$ curl -s -X POST  "127.0.0.1:8000/send/group/1/2.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 4,
    "ReadFlag": false,
    "ReceiverID": 1,
    "SenderID": 1,
    "ShareTime": "2018-08-29T08:30:07.466729218-07:00",
    "Type": 1
}
```
If share asset 2.jpg to group again, its share time will be updated while preserving same share ID
```
$ curl -s -X POST  "127.0.0.1:8000/send/group/1/2.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 4,
    "ReadFlag": false,
    "ReceiverID": 1,
    "SenderID": 1,
    "ShareTime": "2018-08-29T08:31:07.466729218-07:00",
    "Type": 1
}
```

Alice share asset 2.jpg to group `favorite`
```
$ curl -s -X POST  "127.0.0.1:8000/send/group/2/2.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 5,
    "ReadFlag": false,
    "ReceiverID": 2,
    "SenderID": 1,
    "ShareTime": "2018-08-29T08:38:45.117064736-07:00",
    "Type": 1
}
```

Bob also shares 1.jpg to Alice, and group family
```
$ curl -s -X POST  "127.0.0.1:8000/send/user/1/1.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "1.jpg",
    "ID": 6,
    "ReadFlag": false,
    "ReceiverID": 1,
    "SenderID": 2,
    "ShareTime": "2018-09-22T16:44:28.692113-07:00",
    "Type": 0
}
$ curl -s -X POST  "127.0.0.1:8000/send/group/1/1.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "1.jpg",
    "ID": 7,
    "ReadFlag": false,
    "ReceiverID": 1,
    "SenderID": 2,
    "ShareTime": "2018-09-22T16:45:09.230671-07:00",
    "Type": 1
}
```

## Received shared assets to me

Bob receive shared asset from alice
```
$ curl -s "127.0.0.1:8000/receive/user/1?token=573944500" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "3.jpg",
            "ID": 2,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-08-29T08:26:10.093666495-07:00",
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ID": 1,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-08-29T08:24:46.049589465-07:00",
            "Type": 0
        }
    ]
}
```
Because bob also shares 1.jpg to alice before, if request has `includeme=1`, response will also include this record
```
$ curl -s "127.0.0.1:8000/receive/user/1?token=573944500&includeme=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "1.jpg",
            "ID": 6,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-09-22T16:44:28.689449-07:00",
            "Type": 0
        },
        {
            "AssetID": "3.jpg",
            "ID": 2,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-09-22T16:41:32.596494-07:00",
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ID": 1,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-09-22T16:41:09.747749-07:00",
            "Type": 0
        }
    ]
}
```

Because bob never received share from charlie, it should get empty
```
$ curl -s "127.0.0.1:8000/receive/user/3?token=573944500" | python -m json.tool
{
    "Records": []
}
```

Bob receive shared asset in group `family`
```
$ curl -s "127.0.0.1:8000/receive/group/1?token=573944500" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "2.jpg",
            "ID": 4,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 1,
            "ShareTime": "2018-08-30T08:40:07.739408433-07:00",
            "Type": 1
        }
    ]
}
```
Because bob also shares 1.jpg to alice before, if request has `includeme=1`, response will also include this record
```
$ curl -s "127.0.0.1:8000/receive/group/1?token=573944500&includeme=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "1.jpg",
            "ID": 7,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-09-22T16:45:09.229449-07:00",
            "Type": 1
        },
        {
            "AssetID": "2.jpg",
            "ID": 4,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 1,
            "ShareTime": "2018-09-22T16:42:35.57639-07:00",
            "Type": 1
        }
    ]
}
```

Because Bob is not in group `favorite`, it will get "Not belong to this group" error if receiving from it
```
$ curl -s "127.0.0.1:8000/receive/group/2?token=573944500" | python -m json.tool
{
    "id": "13",
    "text": "Not belong to this group"
}
```

Because alice also share asset 2 to group `favorite`, denny should be able to receive it
```
$ curl -s "127.0.0.1:8000/receive/group/2?token=573944500" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "2.jpg",
            "ID": 5,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-08-30T08:40:10.464938721-07:00",
            "Type": 1
        }
    ]
}
```

Alice can not receive shared message sent in the group by herself by default
```
$ curl -s "127.0.0.1:8000/receive/group/2?token=573944500" | python -m json.tool
{
    "Records": []
}
$ curl -s "127.0.0.1:8000/receive/group/1?token=573944500" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "1.jpg",
            "ID": 7,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-09-22T16:45:09.229449-07:00",
            "Type": 1
        }
    ]
}
```
But if request has `includeme=1`, it will return alice's share as well.
```
$ curl -s "127.0.0.1:8000/receive/group/2?token=573944500&includeme=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "2.jpg",
            "ID": 5,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-09-22T16:42:45.647877-07:00",
            "Type": 1
        }
    ]
}
$ curl -s "127.0.0.1:8000/receive/group/1?token=573944500&includeme=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "1.jpg",
            "ID": 7,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-09-22T16:45:09.229449-07:00",
            "Type": 1
        },
        {
            "AssetID": "2.jpg",
            "ID": 4,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 1,
            "ShareTime": "2018-09-22T16:42:35.57639-07:00",
            "Type": 1
        }
    ]
}
```


Download shared asset's preview by its shared_id, for example shareID 2
```
$ curl -s -o 2_preview.jpg "127.0.0.1:8000/receive/preview/2?token=573944500"
```
Download shared asset's preview by its shared_id with desired width and height, for example shareID 2
```
$ curl -s -o 2_preview.jpg "127.0.0.1:8000/receive/preview/2?token=573944500&width=500&height=500"
```
Download shared asset's actual data by its shared_id, for example shareID 2
```
$ curl -s -o 2.jpg "127.0.0.1:8000/receive/asset/2?token=573944500"
```

Received all shared assets to me
```
$ curl -s "127.0.0.1:8000/receive?token=573944500" | python -m json.tool
{
    "Groups": [
        1
    ],
    "Users": [
        1
    ]
}
$ curl -s "127.0.0.1:8000/receive?token=573944500" | python -m json.tool
{
    "Groups": [
        2
    ],
    "Users": [
        1
    ]
}
```
Since Alice has received shared assets from bob both individually and through family, it will get share records as well
```
$ curl -s "127.0.0.1:8000/receive?token=573944500" | python -m json.tool
{
    "Groups": [
        1
    ],
    "Users": [
        2
    ]
}
```

Charlie received sharing from family group only, but not from individual
```
$ curl -s "127.0.0.1:8000/receive?token=573944500" | python -m json.tool
{
    "Groups": [
        1
    ],
    "Users": []
}
```
## Deleted one shared asset
Delete one previous shared asset by shareID. Note that each share has one unique shareID
```
$ curl -s -X DELETE  "127.0.0.1:8000/send/2?token=573944500"
```

## Hide one shared asset
Hide one previous shared asset by shareID. Note that each share has one unique shareID. By default hided asset is not shown up in receive list
TODO: add query string to retrieve hide shared assets
Its format is `/receive/<share id>`. Assuming share ID is 123, below request is to hide share ID 123
```
$ curl -s -X DELETE  "127.0.0.1:8000/receive/123?token=573944500"
```

## Share by HASH
If Alice doesn't know its assetID, it can share asset to user or group by asset's hash, and add `byhash=1` query string.
```
$ curl -s -X POST  "127.0.0.1:8000/send/user/2/7426655f042e8605385cb413de639373b934b18d?token=573944500&byhash=1" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 1,
    "ReadFlag": false,
    "ReceiverID": 2,
    "SenderID": 1,
    "ShareTime": "2018-09-30T07:51:42.288890971-07:00",
    "Type": 0
}

$ curl -s -X POST  "127.0.0.1:8000/send/group/1/7426655f042e8605385cb413de639373b934b18d??token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 4,
    "ReadFlag": false,
    "ReceiverID": 1,
    "SenderID": 1,
    "ShareTime": "2018-08-29T08:30:07.466729218-07:00",
    "Type": 1
}
```

## Share by json
If Alice wants to share multiple asset to multiple users or groups. It can construct this json, and push to server
```
$ cat ./test/sample_share.json
{
    "Records": [
     {
         "AssetID": "3.jpg",
         "ReceiverID": 2,
         "Type": 0
     },
     {
         "AssetID": "2.jpg",
         "ReceiverID": 2,
         "Type": 1
     }]
}
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/sample_share.json "127.0.0.1:8000/send?token=573944500" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "3.jpg",
            "ID": 1,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-31T08:48:10Z-07:00",
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ID": 2,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-31T08:48:10Z-07:00",
            "Type": 1
        }
    ]
}
```
Alice can also share multiple asset with mixed type: by index, or by hash. If AssetIDType is not specified, by default, it is treated as share by index

| AssetIDType  | Description |
| ------------ | ----------- |
| 0            | Asset ID is by index |
| 1            | Asset ID is by hash  |

```
$ cat ./test/sample_share_mixed.json
{
    "Records": [
        {
            "AssetID": "575db2e474109f982ead09e7f8676680a679c9c0",
            "AssetIDType": 1,
            "ReceiverID": 2,
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ReceiverID": 2,
            "Type": 1
        }
    ]
}
$ curl -s -X POST -H "Content-Type: application/json" --data-binary @./test/sample_share_mix.json "127.0.0.1:8000/send?token=573944500" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "575db2e474109f982ead09e7f8676680a679c9c0",
            "AssetIDType": 1,
            "ID": 1,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-31T08:54:29Z-07:00",
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ID": 2,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-31T08:54:29Z-07:00",
            "Type": 1
        }
    ]
}
```
## Cast Assets to one chromecast device
Alice share asset 2.jpg to chromecast user whose ID is 5. Note share type now is 2, which means it is cast to the chromedevice
```
$ curl -s -X POST  "127.0.0.1:8000/cast/5/2.jpg?token=573944500" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 10,
    "ReadFlag": false,
    "ReceiverID": 5,
    "SenderID": 1,
    "ShareTime": "2018-08-29T08:30:07.466729218-07:00",
    "Type": 2
}
```
### Share by HASH
If Alice doesn't know its assetID, it can share asset to chromecast by asset's hash, and add `byhash=1` query string.
```
$ curl -s -X POST  "127.0.0.1:8000/cast/5/7426655f042e8605385cb413de639373b934b18d?token=573944500&byhash=1" | python -m json.tool
{
    "AssetID": "2.jpg",
    "ID": 1,
    "ReadFlag": false,
    "ReceiverID": 5,
    "SenderID": 1,
    "ShareTime": "2018-09-30T07:51:42.288890971-07:00",
    "Type": 2
}
```
## Receive all assets
User can receive all assets shared to me by adding `byassets=1` query string
```
$ curl -s "127.0.0.1:8000/receive?token=573944500&byassets=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "1.jpg",
            "ID": 6,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-10-01T21:30:55.05083062-07:00",
            "Type": 2
        },
        {
            "AssetID": "1.jpg",
            "ID": 7,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-10-01T21:30:55.0980237-07:00",
            "Type": 1
        }
    ]
}
$ curl -s "127.0.0.1:8000/receive?token=573944500&byassets=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "1.jpg",
            "ID": 1,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-01T21:30:54.83057093-07:00",
            "Type": 2
        },
        {
            "AssetID": "3.jpg",
            "ID": 2,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-01T21:30:54.87502525-07:00",
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ID": 4,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 1,
            "ShareTime": "2018-10-01T21:30:54.962463271-07:00",
            "Type": 1
        }
    ]
}
$ curl -s "127.0.0.1:8000/receive?token=573944500&byassets=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "2.jpg",
            "ID": 4,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 1,
            "ShareTime": "2018-10-01T21:30:54.962463271-07:00",
            "Type": 1
        },
        {
            "AssetID": "1.jpg",
            "ID": 7,
            "ReadFlag": false,
            "ReceiverID": 1,
            "SenderID": 2,
            "ShareTime": "2018-10-01T21:30:55.0980237-07:00",
            "Type": 1
        }
    ]
}
$ curl -s "127.0.0.1:8000/receive?token=573944500&byassets=1" | python -m json.tool
{
    "Records": [
        {
            "AssetID": "2.jpg",
            "ID": 3,
            "ReadFlag": false,
            "ReceiverID": 4,
            "SenderID": 1,
            "ShareTime": "2018-10-01T21:30:54.919631646-07:00",
            "Type": 0
        },
        {
            "AssetID": "2.jpg",
            "ID": 5,
            "ReadFlag": false,
            "ReceiverID": 2,
            "SenderID": 1,
            "ShareTime": "2018-10-01T21:30:55.007873618-07:00",
            "Type": 1
        }
    ]
}
```
To be discussed: if one person receives one same shared assets from user share or group share, is it in the receive list?

# Lomo Cloud integration
## Overview
Lomod could integrate with lomo cloud for below functions
1. Lomo cloud provides API driven DDNS service. Lomod can register itself through API and so as to be discovered over internet
2. User should manually set up port mapping to expose port. (uPNP or other mechanism to be supported)
3. Lomod will keep heartbeat with lomo cloud to make sure client ip is the latest

## Lomod API
Lomo client should use this API to enable port mapping for particular host.
If user doesn't provide any port, it means lomod will probe home router via uPnP or Apple NAT-PMP protocol.
```
$ curl -s -X POST '127.0.0.1:8000/cloud/portmap/token=596342671'
{"SubDomain":"hv09mc3l.hub.lomorage.com"}
```

User can also manually set up port mapping and set the public port through the API. Note that letscrypt enforce public port must be 443.
So if client pass 443, lomod will start https listener at 8443 port. otherwise, it would be normal 8000 http port
```
$ curl -s -X POST '127.0.0.1:8000/cloud/portmap/443?token=596342671'
{"SubDomain":"hv09mc3l.hub.lomorage.com"}
```
After this API is invoked, lomod will auto register one account with lomo cloud and use the account for heartbeat. 

Client can also use `system` API to know new allocated subdomain and public address
```
$ curl -s 127.0.0.1:8000/system | python -m json.tool
{
    "APIVersion": "1.0",
    "DiskStatus": "",
    "UUID": "43e229b6-de2a-48de-aa8c-029682169c13",
    "LastBackup": {},
    "ListenIPs": [
        "10.0.1.13",
        "10.0.1.18"
    ],
    "LomodVersion": "883f11282c93",
    "NetworkStatus": "ok",
    "OS": "linux",
    "OSDiskFreeSize": 1516542,
    "OSStatus": {
        "CPU": {
            "Count": 8
        },
        "Disk": {
            "FreeSizeInMB": 1516542,
            "Status": ""
        },
        "Memory": {
            "CachedInMB": 6134,
            "FreeInMB": 5919,
            "TotalInMB": 15909,
            "UsedInMB": 1889
        },
        "Network": {
            "ListenIPs": [
                "10.0.1.13",
                "10.0.1.18"
            ],
            "PublicAddr": null,
            "Status": "ok"
        },
        "TimeZone": {
            "Name": "UTC",
            "Offset": 0
        },
        "Uptime": "16d48m15s"
    },
    "PublicAddr": null,
    "SystemStatus": 1,
    "TimezoneName": "UTC",
    "TimezoneOffset": 0,
    "UserDisks": [
        {
            "Error": "",
            "FreeSize": 1333,
            "Username": "alice"
        }
    ],
    "UserStatus": {
        "alice": {
            "HomeDisk": {
                "FreeSizeInMB": 1333,
                "ErrorCode": 0,
                "Status": ""
            }
        }
    }
}
```
Note that below fields should be deprecated and read from OSStatus section
```
{
    "DiskStatus": "",
    "ListenIPs": [
        "10.0.1.14"
    ],
    "NetworkStatus": "ok",
    "OSDiskFreeSize": 35092,
    "PublicAddr": [],
    "TimezoneName": "PST",
    "TimezoneOffset": -8,
}
```
# Log Mgmt
## Download both access log and debug log
For easy debug, below API is used to download log files which are gzip format
```
$ curl -o log.gz "127.0.0.1:8000//system/log?token=573944500"
$ ls
log.tar.gz
$ tar -zxf log.tar.gz
$ ls
log.tar.gz       lomod.log        lomod_access.log system.log
```

The downloaded tar ball includes system log, lomod debug log and event log which is extension of standard apache log format. See http://httpd.apache.org/docs/2.2/logs.html#common for a description of this format. One more extension is lomod add response time at the end so that people can know how long one file upload taks
```
127.0.0.1 iphonex alice [02/Jun/2019:18:12:24 -0700] "GET /log HTTP/1.1" 200 16908 [02/Jun/2019:18:12:24 -0700]
Each part of this log entry is described below.

127.0.0.1
This is the IP address of the client (remote host) which made the request to the server. If HostnameLookups is set to On, then the server will try to determine the hostname and log it in place of the IP address. However, this configuration is not recommended since it can significantly slow the server. Instead, it is best to use a log post-processor such as logresolve to determine the hostnames. The IP address reported here is not necessarily the address of the machine at which the user is sitting. If a proxy server exists between the user and the server, this address will be the address of the proxy, rather than the originating machine.
iphonex
The request is from device iphonex which is the user login from before
alice
This is the userid of the person requesting the document as determined by HTTP authentication.
[02/Jun/2019:18:12:24 -0700]
The time that the request was received. The format is:
[day/month/year:hour:minute:second zone]
day = 2*digit
month = 3*letter
year = 4*digit
hour = 2*digit
minute = 2*digit
second = 2*digit
zone = (`+' | `-') 4*digit

"GET /log HTTP/1.1"
The request line from the client is given in double quotes. The request line contains a great deal of useful information. First, the method used by the client is GET. Second, the client requested the resource /apache_pb.gif, and third, the client used the protocol HTTP/1.0. It is also possible to log one or more parts of the request line independently. For example, the format string "%m %U%q %H" will log the method, path, query-string, and protocol, resulting in exactly the same output as "%r".
200
This is the status code that the server sends back to the client. This information is very valuable, because it reveals whether the request resulted in a successful response (codes beginning in 2), a redirection (codes beginning in 3), an error caused by the client (codes beginning in 4), or an error in the server (codes beginning in 5). The full list of possible status codes can be found in the HTTP specification (RFC2616 section 10).
16908
The part indicates the size of the object returned to the client, not including the response headers.
[02/Jun/2019:18:12:24 -0700]
The time that the request was sent. The format is:
```

## Download Access Log only
Below API can be used to download access log file only. It is also gzip format
```
$ curl -o log.gz "127.0.0.1:8000/system/log/access?token=573944500"
$ ls
log.tar.gz
$ tar -zxf log.tar.gz
$ ls
log.tar.gz      lomod_access.log
```

## Set log level
For easy debug, below API is used to set remote log level
```
$ curl -X POST "127.0.0.1:8000/system/log/1?token=573944500"
```

Log level is defined as below

| LogLvel  | Name    | Description |
| -------- | ------- | ----------- |
| 0        | Panic   | PanicLevel level, highest level of severity. Logs and then calls panic with the message passed to Debug, Info, ...  |
| 1        | Fatal   | FatalLevel level. Logs and then calls `logger.Exit(1)`. It will exit even if the logging level is set to Panic.  |
| 2        | Error   | ErrorLevel level. Logs. Used for errors that should definitely be noted. Commonly used for hooks to send errors to an error tracking service.  |
| 3        | Warn    | WarnLevel level. Non-critical entries that deserve eyes.  |
| 4        | Info    | InfoLevel level. General operational entries about what's going on inside the application.  |
| 5        | Debug   | DebugLevel level. Usually only enabled when debugging. Very verbose logging.  |
| 6        | Trace   | TraceLevel level. Designates finer-grained informational events than the Debug.  |


## Upload Log
Client can also upload log, which can be downloaded together. Note that log file is named as username.log. So every new upload will override old one
```
$ curl -s -X POST -H "Content-Type: application/octet-stream" --data-binary my.log "127.0.0.1:8000/log?token=1234567"
```


# WIFI mode switch
Set to ethernet mode
```
$ curl -X POST "127.0.0.1:8000/system/nw"
```
Set to AP mode
```
$ curl -X POST "127.0.0.1:8000/system/wifi"
```
Set to Client mode
```
$ curl -X POST "127.0.0.1:8000/system/wifi/<auth>/<ssid>/<password>"
```
Note that once user is created, setting wifi mode has to carry username and token as authentication

# Upgrade triggered by API
```
$ curl -X POST "127.0.0.1:8000/system/upgrade"
```
# Backup Mgmt
## Set backup dir
Client can use below API to download backup directory for one user. It assumes client has use `ListMount` API to get all mounted and disks, and determined one disk for backup.
Note that below API assumes lomod use `/tmp` as mount dir and `backup` is one disk
```
$ curl -s 127.0.0.1:8000/user | python -m json.tool
  {
      "Users": [
          {
              "BackupDir": "",
              "Email": "",
              "HomeDir": "/tmp/alice",
              "ID": 1,
              "Name": "alice",
              "NickName": "",
              "Password": "",
              "Phone": ""
          }
      ]
  }
$ curl -X POST -d '{"Username":"alice", "DestDisk": "backup"}' -H "Content-Type: application/json" "127.0.0.1:8000/system/backup?token=877093499"
$ curl -s 127.0.0.1:8000/user | python -m json.tool
  {
      "Users": [
          {
              "BackupDir": "/tmp/backup/alice",
              "Email": "",
              "HomeDir": "/tmp/alice",
              "ID": 1,
              "Name": "alice",
              "NickName": "",
              "Password": "",
              "Phone": ""
          }
      ]
  }
```
## Get backup result
After backup, client can get backup result through system info API.
```
$ curl -s 127.0.0.1:8000/system | python -m json.tool
{
    "APIVersion": "1.0",
    "UUID": "43e229b6-de2a-48de-aa8c-029682169c13",
    "OSDiskFreeSize": 39169,
    "DiskStatus": "",
    "LastBackup": {
        "alice": {
            "AssetRetCode": "",
            "LastAssetBackup": "2019-05-23T23:29:20.040828-07:00",
            "LastAssetSuccess": "2019-05-23T23:29:20.040828-07:00",
        }
    },
    "LomodVersion": "9571a25408bc",
    "NetworkStatus": "ok",
    "OS": "darwin",
    "SystemStatus": 1,
    "TimezoneName": "PDT",
    "TimezoneOffset": -7,
    "UserDisks": [
        {
            "Error": "",
            "FreeSize": 1333,
            "Username": "alice"
        }
    ],
    "UserStatus": {
        "alice": {
            "HomeDisk": {
                "FreeSizeInMB": 1333,
                "ErrorCode": 0,
                "Status": ""
            }
        }
    }
}
```
## Force backup
Regular backup is triggered daily. At the same time, client can always trigger on-demand backup by below API. After trigger, client can always use get backup result to know if backup is success or not
```
$ curl -X PUT http://127.0.0.1:8000/system/backup?token=1234567
```
## Remove backup directory
Client can use below API to remove backup directory and leave it blank
```
$ curl -X DELETE http://127.0.0.1:8000/system/backup?token=1234567
```
# Restore Mgmt
## DB restore
Right now, backend only supports DB restore. DB are replicated to each user media directories, so client can indicate the actual users restoring from.
```
$ curl -X POST http://127.0.0.1:8000/system/restore/db/alice?token=1234567
```
# System Info
System information can be queried by below API without token. 

- WebpPreview attribute is true means backend support webp preview creation
```
$ curl "127.0.0.1:8000/system" | python -m json.tool
{
    "APIVersion": "1.0",
    "UUID": "43e229b6-de2a-48de-aa8c-029682169c13",
    "OSDiskFreeSize": 39169,
    "DiskStatus": "",
    "LastBackup": {
        "alice": {
            "AssetRetCode": "",
            "AssetTime": "2019-05-23T23:29:20.040828-07:00",
            "DBRetCode": "",
            "DBTime": "0001-01-01T00:00:00Z",
            "LastAssetSuccess": "2019-05-23T23:29:20.040828-07:00",
            "LastDBSuccess": "0001-01-01T00:00:00Z"
        }
    },
    "ListenIPs": [
        "10.0.1.11"
    ],
    "LomodVersion": "9571a25408bc",
    "NetworkStatus": "ok",
    "OS": "darwin",
    "SystemStatus": 1,
    "WebpPreview": true,
    "TimezoneName": "PDT",
    "TimezoneOffset": -7,
    "UserDisks": [
        {
            "Error": "",
            "FreeSize": 1333,
            "Username": "alice"
        }
    ],
    "UserStatus": {
      "alice": {
        "AssetSummary": {
          "jpg": {
            "Count": 3,
            "Size": 1438014
          },
          "mp4": {
            "Count": 1,
            "Size": 7360
          },
          "png": {
            "Count": 1,
            "Size": 44969
          },
          "zip": {
            "Count": 1,
            "Size": 238254
          }
        },
        "HomeDisk": {
          "Status": "",
          "ErrorCode": 0,
          "FreeSizeInMB": 1334
        }
      },
      "bob": {
        "AssetSummary": {
          "heic": {
            "Count": 1,
            "Size": 1051433
          },
          "jpg": {
            "Count": 2,
            "Size": 318272
          },
          "zip": {
            "Count": 1,
            "Size": 1055380
          }
        },
        "HomeDisk": {
          "Status": "",
          "ErrorCode": 0,
          "FreeSizeInMB": 1400423
        }
      }
    }
}
```
## User asset summary
System info will return all users's asset summary. TODO: only return all users' summary for admin user
```
      "alice": {
        "AssetSummary": {
          "jpg": {
            "Count": 3,
            "Size": 1438014
          },
          "mp4": {
            "Count": 1,
            "Size": 7360
          },
          "png": {
            "Count": 1,
            "Size": 44969
          },
          "zip": {
            "Count": 1,
            "Size": 238254
          }
        },
        "HomeDisk": {
          "Status": "",
          "ErrorCode": 0,
          "FreeSizeInMB": 1334
        }
      },
```
If SD card disk has issue, OSDiskFreeSize = -1
If any user disk has issue, its freesize = -1

Based on the current status, `SystemStatus` has below value

| SystemStatus | Description |
| -----------  | ----------- |
| -1           | System is abnormal   |
| 0            | New System, without any users yet   |
| 1            | System has been initialized and users are created  |

## System factory reset
Client can reset to factory mode by below API.
```
$ curl -X POST 127.0.0.1:8000/system/factoryreset?token=722865842
```

## Poweroff
Client can always signal backend to poweroff. Note that client should only send the command when system is ARM based device
```
$ curl -X POST 127.0.0.1:8000/system/poweroff?token=722865842
```
Client can always add `reboot=1` query string to signal backend to reboot host. Note that both reboot and poweroff will delay in one minute for some cleanup operation. Also 

1. if under maintenance，maintenance error will be returned.
2. if still have preview generation in the background, maintenance error will be returned too.

## Enable/Disable lomo cloud IP helper
Lomo cloud provides IP helper service to help client discover intranet lomod service in case MDNS fail. Since this is private data, user can choose to disable to function
To enable it,
```
$ curl -X POST 127.0.0.1:8000/system/iphelper?token=519693924
```
To disable it,
```
$ curl -X DELETE 127.0.0.1:8000/system/iphelper?token=519693924
```

# Set timezone
Lomod backend support setting timezone by client remotely as well as listing current timezone supported by backend. Client should compare the list and select the closet one.
Note that currently setting timezone is only supported at raspberry pi platform.

```
$ curl 127.0.0.1:8000/system/timezone?token=519693924 | python -m json.tool
[
    "+VERSION",
    "Africa/Abidjan",
    "Africa/Accra",
    "Africa/Addis_Ababa",
    "Africa/Algiers",
    "Africa/Asmara",
    "Africa/Asmera",
    "Africa/Bamako",
    "Africa/Bangui",
    "Africa/Banjul",
    "Africa/Bissau",
    "Africa/Blantyre",
    "Africa/Brazzaville",
    "Africa/Bujumbura",
    "Africa/Cairo",
    "Africa/Casablanca",
    "Africa/Ceuta",
    "Africa/Conakry",
    "Africa/Dakar",
    "Africa/Dar_es_Salaam",
    "Africa/Djibouti",
    ....
]
$ timedatectl status
      Local time: Tue 2019-07-02 22:49:50 PDT
  Universal time: Wed 2019-07-03 05:49:50 UTC
        RTC time: n/a
       Time zone: America/Los_Angeles (PDT, -0700)
 Network time on: yes
NTP synchronized: yes
 RTC in local TZ: no

$ curl -X POST -d '{"Timezone":"Asia/Shanghai"}' -H "Content-Type: application/json" 127.0.0.1:8000/system/timezone?token=519693924
$ timedatectl status
      Local time: Wed 2019-07-03 13:53:26 CST
  Universal time: Wed 2019-07-03 05:53:26 UTC
        RTC time: n/a
       Time zone: Asia/Shanghai (CST, +0800)
 Network time on: yes
NTP synchronized: yes
 RTC in local TZ: no
```

# System Configuration
Client can use below API to get system configuration, such as ip enable setting
```
$ curl -s 127.0.0.1:8000/system/conf?token=1234567
{"cloud_ip_helper":"0", "webdav_layout":"0"}
```

Client can also set certain configuration. Supported key is "webdav_layout" and support layouts are

 - 0: yyyy/mm/dd (default layout)
 - 1: yyyy/mm
 - 2: yyyy/

For example, below example sets webdav directory layout to yyyy style
```
$ curl -s -X POST 127.0.0.1:8000/system/conf/webdav_layout/2?token=1234567
```

# Debug
There are many APIs for debugging purposes.
## Debug collection
Client can request backend to collect pcap and ping data with below APIs to start and stop collection. If `duration` is not provided, it will use default duration 5m which is configurable as part of `lomod` start argument.
```
$ curl -X POST -v 127.0.0.1:8000/debug/collect/start?token=1234567&duration=3m
$ curl -X POST -v 127.0.0.1:8000/debug/collect/stop?token=1234567
```

# Error Code
If there is error, HTTP status code is usually 500 except 409 for deplicate HASH. Body has below json structure
```
{
    "id": <Error Code>,
    "text": <Description>
}
```
Below is the list of all supported error code

| Error Code  | HTTP Code | Description |
| ----------- | --------- | ----------- |
| 0           | 400       | System Dependant  |
| 1           | 400       | Bad Request  |
| 2           | 400       | Asset Exist  |
| 3           | 401       | Invalid Username/Password  |
| 4           | 401       | Invalid Token  |
| 5           | 400       | Invalid Month  |
| 6           | 400       | Invalid Day  |
| 7           | 400       | Different username and owner name  |
| 8           | 400       | No timestamp  |
| 9           | 404       | User is not exist  |
| 10          | 404       | Device for the token is not exist  |
| 11          | 400       | Empty groupname  |
| 12          | 400       | Empty owner  |
| 13          | 400       | Not belong to this group  |
| 14          | 500       | Device is not mounted yet  |
| 15          | 507       | Unable to locate device UUID  |
| 16          | 400       | Not implemented format  |
| 17          | 400       | Empty asset  |
| 18          | 400       | Group already exist  |
| 19          | 404       | Asset not shared to the user  |
| 20          | 404       | Asset not exist for the user  |
| 21          | 400       | User's directory is invalid format |
| 22          | 404       | Asset is not exist |
| 23          | 500       | Wrong asset cache |
| 24          | 400       | Uploaded asset has different hash" |
| 25          | 503       | API can only be visited internally |
| 26          | 500       | Service is in maintenance mode |
| 27          | 400       | QuickTime:ComLomorageOriginhash tag not found |
| 28          | 400       | Empty user |
| 29          | 401       | Invalid admin token |
| 30          | 400       | Invalid name  |
| 31          | 400       | Invalid user  |
| 32          | 500       | Retry attempt failure |
| 33          | 503       | Scan in progress |
| 34          | 403       | Resource not found |
| 35          | 400       | No create time |
| 36          | 500       | Invalid Disk Mount |
| 37          | 500       | Fail to mkdir |
| 38          | 500       | Fail to create file |
| 39          | 500       | Try later |
| 40          | 500       | TBD  |
