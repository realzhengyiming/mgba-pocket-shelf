#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Original synthesized approximation of the rising startup flourish and bell."""
from pathlib import Path
import math, struct, wave
rate=32768
out=Path(__file__).resolve().parents[1]/'assets/native/boot-chime.wav'
notes=[(.46+i*.085,440*2**(i/6),.18,.12) for i in range(7)]
notes += [(2.38,1046.502,.95,.32),(2.39,2093.005,.7,.10)]
data=bytearray()
for n in range(round(rate*3.9)):
    t=n/rate;s=0
    for start,freq,length,gain in notes:
        age=t-start
        if 0<=age<length:
            envelope=min(1,age/.003)*math.exp(-age/(length*.22))*min(1,(length-age)/.015)
            tone=math.sin(2*math.pi*freq*age)+.22*math.sin(2*math.pi*freq*2.005*age)+.08*math.sin(2*math.pi*freq*3*age)
            s+=tone*envelope*gain
    sample=round(max(-.8,min(.8,s))*32767)
    data+=struct.pack('<hh',sample,sample)
with wave.open(str(out),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes(data)
print(out)
