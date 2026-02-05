Lumatic Glare Removal

The goal here is to use Google Nano Banana to perform glare removal on headshot photos of people wearing eyeglasses. There are two core routes:
1) A person wearing glasses in one photo, a second photo of them not wearing glasses. The second photo is used to help fill in detail for behind the glasses lenses once the glare is removed. Here is a prompt that has worked:
    Here is a sample prompt that has worked well: Attached are two photos one with glasses and one without. I want you to take the one with glasses as a base image and it is VERY IMPORTANT to change nothing about that image except for the glass lenses - make sure to not change the shape of the glass frames, or any other pixels anywhere on the image, etc. The second image is without glasses and is meant to provide source material for what the subjects eyes look like beneath the glasses with glare - use that information to make the eyes look reasonable after you remove the glare (and don't remove the glass altogether!) from the glasses in the base image.

2) Second is a photo with a glare on the glasses lenses and no second photo. In that case the gemini prompt has been harder:
    This image has a glare on the glasses. The goal is to generate an image just like this but remove the glare on the glasses. CRITICAL & VERY IMPORTANT to change nothing about that image except for the glass lenses - make sure to not change the shape of the glass frames or remove any part of them, or to change any other pixels anywhere on the image, etc. 


The raw_examples directory contains a large number of images and the human edited versions for success.

I want you to first organize the raw_examples into two sub-diretories - examples with no_glasses photos and then examples without a no_glasses photo. And I want you to make sure all of them are named in a way that the edited one is clearly associated with the un-edited photos. And that the no_glasses and with_glasses photos are related correctly and named consistently.

Initially I want to only test with 10 images to avoid using too much of my Gemini Quota while dialing it in.

The system should utilize gemini command-line authenticated to my mec@cloran.com account for now to make the Nano-Banana calls.

I want a react vite front end interface that will eventually allow a photo to be uploaded and then a gemini command-line call in the background - but for now it will need just one "test results" tab - where it will show up to four photos side-by-side on each "line": photo-with-no-glasses, photo-with-glasses-with-glare, gemini-edited-with-glasses-glare-removed, and human-edited-with-glasses-glare-removed.





