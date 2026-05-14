import requests

url = "https://api.minecraftservices.com/minecraft/profile/skins"
r = requests.post(url, files={"wrong_name": ("skin.png", b"dummy_bytes", "image/png")}, data={"variant": "classic"})
print("POST wrong:", r.status_code, r.text)
r = requests.post(url, files={"file": ("skin.png", b"dummy_bytes", "image/png")}, data={"variant": "classic"})
print("POST file:", r.status_code, r.text)
r = requests.put(url, files={"file": ("skin.png", b"dummy_bytes", "image/png")}, data={"variant": "classic"})
print("PUT file:", r.status_code, r.text)

