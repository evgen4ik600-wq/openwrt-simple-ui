# OpenWrt Simple UI v2 — standalone shell

## Architecture

OpenWrt remains the **base operating system / platform**, not only the Linux kernel.

We keep the low-level OpenWrt stack:

- Linux kernel
- netifd
- firewall4 / nftables
- dnsmasq
- hostapd / wpad
- procd
- UCI
- ubus / rpcd
- apk
- AmneziaWG kernel/userspace components

The normal user interface is replaced by our own web application.

### Layers

```
Browser
  ↓
Simple UI SPA
  ↓ JSON-RPC
/ubus
  ↓
rpcd + simpleui backend
  ↓
UCI / ubus / nft / awg / iwinfo / network services
  ↓
OpenWrt platform
```

LuCI stays installed only as a hidden emergency/admin interface during development.
When v2 is stable, a custom firmware image can omit most visible LuCI modules and boot directly into Simple UI.

## Goals

- one coherent left-side navigation
- Keenetic-like information architecture, not a copy of Keenetic branding
- responsive desktop/mobile UI
- live traffic graphs without collectd
- Wi-Fi overview and client list
- Ethernet port state
- AmneziaWG status and routing
- GeoSite + GeoIP service profiles
- update / backup / reboot
- advanced OpenWrt fallback
- low flash footprint

## Safety

- Simple UI must never replace the system default route for selective routing
- failed VPN or invalid nftables rules must fail open to WAN
- config writes are performed through dedicated backend methods
- installer always backs up UCI config files before first write
- LuCI fallback is retained until v2 is proven stable
