#!/usr/bin/env python3
"""assets/models/*.glb 의 텍스처를 줄여 로딩을 빠르게 한다.

- baseColor 텍스처: 최대 1024px JPEG
- emissive 텍스처: 최대 512px JPEG
- normal / metallicRoughness 텍스처: 제거 (만화풍 게임에서는 차이가 거의 없고 용량의 절반 이상을 차지한다)

사용법:  python3 tools/shrink_glb.py assets/models/*.glb   (원본을 덮어쓴다. 원본은 git 기록에 남아 있다)
필요:    pip install pillow
"""
import io, json, struct, sys
from PIL import Image

MAX = {'baseColorTexture': 1024, 'emissiveTexture': 512}
DROP = {'normalTexture', 'metallicRoughnessTexture', 'occlusionTexture'}
QUALITY = 82

def read_glb(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    return j, b[28 + jl:28 + jl + bl]

def write_glb(path, j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bin_ += b'\0' * (-len(bin_) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(bin_)) + b'BIN\0' + bin_
    open(path, 'wb').write(out)

def shrink(path):
    j, bin_ = read_glb(path)
    before = 28 + len(bin_)
    # 어떤 이미지가 어떤 용도로 쓰이는지
    use = {}
    for m in j.get('materials', []):
        slots = dict(m.get('pbrMetallicRoughness', {}))
        slots.update({k: v for k, v in m.items() if k.endswith('Texture')})
        for k, v in slots.items():
            if isinstance(v, dict) and 'index' in v:
                src = j['textures'][v['index']].get('source')
                if src is not None: use.setdefault(src, set()).add(k)
    # 재질에서 제거할 슬롯 삭제
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        if 'metallicRoughnessTexture' in pbr:
            del pbr['metallicRoughnessTexture']
            pbr['metallicFactor'] = 0.0
            pbr['roughnessFactor'] = 0.85
        for k in list(m.keys()):
            if k in DROP: del m[k]
    # 이미지별 새 데이터 만들기 (None 이면 제거)
    new_img = {}
    for i, img in enumerate(j.get('images', [])):
        kinds = use.get(i, set())
        if not kinds or kinds <= DROP:
            new_img[i] = None; continue
        bv = j['bufferViews'][img['bufferView']]
        off = bv.get('byteOffset', 0)
        im = Image.open(io.BytesIO(bin_[off:off + bv['byteLength']])).convert('RGB')
        limit = min(MAX.get(k, 1024) for k in kinds if k in MAX) if any(k in MAX for k in kinds) else 1024
        if max(im.size) > limit: im.thumbnail((limit, limit), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=QUALITY, optimize=True)
        new_img[i] = (buf.getvalue(), im.size)
    # bufferView 다시 쌓기
    img_bv = {img['bufferView']: i for i, img in enumerate(j.get('images', []))}
    out = bytearray(); bv_map = {}; new_bvs = []
    for k, bv in enumerate(j['bufferViews']):
        if k in img_bv:
            data = new_img[img_bv[k]]
            if data is None: continue
            data = data[0]
        else:
            off = bv.get('byteOffset', 0); data = bin_[off:off + bv['byteLength']]
        out += b'\0' * (-len(out) % 4)
        nb = dict(bv); nb['byteOffset'] = len(out); nb['byteLength'] = len(data)
        bv_map[k] = len(new_bvs); new_bvs.append(nb); out += data
    j['bufferViews'] = new_bvs
    j['buffers'] = [{'byteLength': len(out)}]
    for a in j.get('accessors', []):
        if 'bufferView' in a: a['bufferView'] = bv_map[a['bufferView']]
        for key in ('indices', 'values'):
            sp = a.get('sparse', {}).get(key)
            if sp: sp['bufferView'] = bv_map[sp['bufferView']]
    # 이미지/텍스처 인덱스 다시 매기기
    img_map = {}; imgs = []
    for i, img in enumerate(j.get('images', [])):
        if new_img[i] is None: continue
        img_map[i] = len(imgs); imgs.append({**img, 'bufferView': bv_map[img['bufferView']], 'mimeType': 'image/jpeg'})
    j['images'] = imgs
    tex_map = {}; texs = []
    for t, tex in enumerate(j.get('textures', [])):
        if tex.get('source') in img_map:
            tex_map[t] = len(texs); texs.append({**tex, 'source': img_map[tex['source']]})
    j['textures'] = texs
    for m in j.get('materials', []):
        for holder in (m, m.get('pbrMetallicRoughness', {})):
            for k, v in list(holder.items()):
                if isinstance(v, dict) and 'index' in v:
                    if v['index'] in tex_map: v['index'] = tex_map[v['index']]
                    else: del holder[k]
    write_glb(path, j, bytes(out))
    after = 28 + len(out)
    print(f'{path}: {before // 1024} KB -> {after // 1024} KB, 텍스처 {[(s[1]) for s in new_img.values() if s]}')

if __name__ == '__main__':
    for p in sys.argv[1:]: shrink(p)
