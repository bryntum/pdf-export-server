
### Comparing PNGs

This is a metric for two screenshots that look similar, but one with different border style
(new release happened, old styles locally)
```
> tests/binary/imagemagick/linux64/compare -metric fuzz tests/samples/compare-tuning/shot_linux.png tests/samples/compare-tuning/1px_border.png diff.png
3700.68
```

This is a metric for two screenshots that use the same styles, taken on windows and linux.
This is the **threshold**.
```
> tests/binary/imagemagick/linux64/compare -metric fuzz tests/samples/compare-tuning/shot_linux.png tests/samples/compare-tuning/shot_windows.png diff1.png
1030.69
```

This is a metric for two screenshots, but one has one symbol 0 replaced with 1..
```
> tests/binary/imagemagick/linux64/compare -metric fuzz tests/samples/compare-tuning/shot_linux.png tests/samples/compare-tuning/shot_windows_0-1.png diff2.png
1030.46
```

But when screenshot is taken on different machines it could differ a little more. Visually images are ok, but given the different border size, metric
is much biger, like 5280.

